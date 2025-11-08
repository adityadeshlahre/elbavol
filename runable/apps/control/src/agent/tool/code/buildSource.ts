import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import fs from "fs";
import type { Producer } from "kafkajs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";
import { producer } from "../../../index";

export const buildProjectAndNotifyToRun = async (
  projectId: string,
  producer: Producer,
) => {
  const dir = path.join("/app/shared", projectId);

  if (!fs.existsSync(dir)) {
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_FAILED,
            projectId,
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
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_FAILED,
            projectId,
            error: "package.json not found",
          }),
        },
      ],
    });
    return false;
  }

  try {
    const installProc = Bun.spawn(["bun", "install"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const installCode = await installProc.exited;
    if (installCode !== 0) {
      const error = await new Response(installProc.stderr).text();
      await producer.send({
        topic: TOPIC.SERVING_TO_ORCHESTRATOR,
        messages: [
          {
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_FAILED,
              projectId,
              error: `Failed to install dependencies: ${error}`,
            }),
          },
        ],
      });
      return false;
    }

    const buildProc = Bun.spawn(["bun", "run", "build"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const buildCode = await buildProc.exited;
    if (buildCode !== 0) {
      const error = await new Response(buildProc.stderr).text();
      await producer.send({
        topic: TOPIC.SERVING_TO_ORCHESTRATOR,
        messages: [
          {
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_FAILED,
              projectId,
              error: `Failed to build project: ${error}`,
            }),
          },
        ],
      });
      return false;
    }

    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_BUILD,
            projectId,
          }),
        },
      ],
    });

    await producer.send({
      topic: TOPIC.CONTROL_TO_SERVING,
      messages: [
        {
          key: projectId,
          value: MESSAGE_KEYS.PROJECT_BUILD,
        },
      ],
    });

    return true;
  } catch (error) {
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_FAILED,
            projectId,
            error: `Build error: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    });
    return false;
  }
};

const buildSourceInput = z.object({
  projectId: z.string().min(1, "Project ID is required"),
});

export const buildSource = tool(
  async (input: z.infer<typeof buildSourceInput>) => {
    const { projectId } = buildSourceInput.parse(input);

    const success = await buildProjectAndNotifyToRun(projectId, producer);

    return {
      success,
      projectId,
      message: success ? "Project built successfully" : "Project build failed",
    };
  },
  {
    name: "buildSource",
    description:
      "Builds the project by installing dependencies and running the build script, then notifies the orchestrator about the build status.",
    schema: buildSourceInput,
  },
);
