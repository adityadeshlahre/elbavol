import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import fs from "fs";
import type { Producer } from "kafkajs";
import path from "path";
import { spawn, type ChildProcess } from "node:child_process";
const runningProcesses = new Map<string, ChildProcess>();

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
    const killProc = spawn("sh", ["-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`]);
    await new Promise((resolve) => killProc.on("close", resolve));
    console.log(`Killed existing process on port ${port}`);
  } catch (error) {
    console.error(`Failed to free port ${port}:`, error);
  }

  const existingProc = runningProcesses.get(projectId);
  if (existingProc) {
    console.log(`Killing existing process for project ${projectId}`);
    existingProc.kill();
    runningProcesses.delete(projectId);
  }

  console.log(`Installing dependencies for project ${projectId}`);
  const installProc = spawn("bun", ["install"], { cwd: dir, stdio: 'pipe' });

  installProc.stdout?.on('data', (data) => console.log(`[${projectId}] install:`, data.toString()));
  installProc.stderr?.on('data', (data) => console.error(`[${projectId}] install error:`, data.toString()));

  const installCode: number = await new Promise((resolve) => installProc.on("close", resolve));

  if (installCode !== 0) {
    console.error(`Failed to install dependencies for ${projectId}`);
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_RUN_FAILED,
            error: `Failed to install dependencies (exit code: ${installCode})`,
          }),
        },
      ],
    });
    return false;
  }

  let scriptName: string;
  if (packageJson.scripts?.start) {
    scriptName = "start";
  } else if (packageJson.scripts?.preview) {
    scriptName = "preview";
  } else {
    scriptName = "preview";
  }

  console.log(`Starting server for project ${projectId} on port ${port} with script: ${scriptName}`);

  const proc = spawn("bun", ["run", scriptName], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, PORT: port.toString() },
  });

  runningProcesses.set(projectId, proc);

  proc.stdout?.on('data', (data) => {
    console.log(`[${projectId}] stdout:`, data.toString());
  });

  proc.stderr?.on('data', (data) => {
    console.error(`[${projectId}] stderr:`, data.toString());
  });

  proc.on('error', (error) => {
    console.error(`[${projectId}] Process error:`, error);
  });

  console.log(`Waiting for server to start on port ${port}...`);
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const checkProc = spawn("nc", ["-z", "localhost", port.toString()]);
  const checkCode: number = await new Promise((resolve) => {
    checkProc.on("close", resolve);
  });

  if (checkCode === 0) {
    console.log(`Server is running on port ${port} for project ${projectId}`);
    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_RUN_SUCCESS,
            projectId,
            port,
            url: `http://localhost:${port}`,
          }),
        },
      ],
    });

    proc.on("close", async (code) => {
      console.log(`Server process for ${projectId} exited with code ${code}`);
      runningProcesses.delete(projectId);

      if (code !== 0) {
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
  } else {
    console.error(`Server failed to start on port ${port} for project ${projectId}`);
    proc.kill();
    runningProcesses.delete(projectId);

    await producer.send({
      topic: TOPIC.SERVING_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_RUN_FAILED,
            error: `Server did not start on port ${port}`,
          }),
        },
      ],
    });

    return false;
  }
};
