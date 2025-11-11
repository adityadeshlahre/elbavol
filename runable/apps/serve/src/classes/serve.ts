import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import fs from "fs";
import type { Producer } from "kafkajs";
import path from "path";

export const serveTheProject = async (
  projectId: string,
  producer: Producer,
) => {
  const sharedDir = process.env.SHARED_DIR || "/app/shared";
  const dir = path.join(sharedDir, projectId);

  if (!fs.existsSync(dir)) {
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_FAILED,
            error: "Project directory not found",
          }),
        },
      ],
    });
    return false;
  }

  const packageJsonPath = path.join(dir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_FAILED,
            error: "package.json not found",
          }),
        },
      ],
    });
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const startScript = packageJson.scripts?.start;
  if (!startScript) {
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_RUN_FAILED,
            error: "No start script in package.json",
          }),
        },
      ],
    });
    return false;
  }

  const port = 3000;

  try {
    const killProc = Bun.spawn(
      ["sh", "-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    await killProc.exited;
  } catch (error) {
    console.error(`Failed to free port ${port}:`, error);
  }

  const proc = Bun.spawn(["sh", "-c", `cd "${dir}" && ${startScript}`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  console.log(`Starting server for project ${projectId} on port ${port}`);

  proc.exited.then(async (code) => {
    if (code === 0) {
      await producer.send({
        topic: TOPIC.SERVING_TO_ORCHESTRATOR,
        messages: [
          {
            key: projectId,
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_RUN_SUCCESS,
              projectId,
            }),
          },
        ],
      });
    } else {
      await producer.send({
        topic: TOPIC.SERVING_TO_ORCHESTRATOR,
        messages: [
          {
            key: projectId,
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_RUN_FAILED,
              error: `Server process exited with code ${code}`,
            }),
          },
        ],
      });
    }
  });

  return true;
};
