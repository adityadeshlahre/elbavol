import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import fs from "fs";
import type { Producer } from "kafkajs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";
import { producer } from "../../../index";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/workflow";
import { spawn } from "node:child_process";

export const buildProjectAndNotifyToRun = async (
  projectId: string,
  producer: Producer,
) => {
  const sharedDir = process.env.SHARED_DIR || "/app/shared";
  const dir = path.join(sharedDir, projectId);

  if (!fs.existsSync(dir)) {
    await producer.send({
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
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
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
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
    const installProc = spawn("bun", ["install"], { cwd: dir });

    let installStderr = "";
    installProc.stderr.on("data", (chunk) => {
      installStderr += chunk.toString();
    });

    const installCode = await new Promise((resolve) => {
      installProc.on("close", (code) => resolve(code));
      installProc.on("error", () => resolve(1));
    });

    if (installCode !== 0) {
      await producer.send({
        topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
        messages: [
          {
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_BUILD_FAILED,
              projectId,
              error: `Failed to install dependencies: ${installStderr}`,
            }),
          },
        ],
      });
      return false;
    }

    const buildProc = spawn("bun", ["run", "build"], { cwd: dir });
    let buildStderr = "";
    buildProc.stderr.on("data", (chunk) => {
      buildStderr += chunk.toString();
    });

    const buildCode = await new Promise((resolve) => {
      buildProc.on("close", (code) => resolve(code));
      buildProc.on("error", () => resolve(1));
    });

    if (buildCode !== 0) {
      await producer.send({
        topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
        messages: [
          {
            value: JSON.stringify({
              key: MESSAGE_KEYS.PROJECT_BUILD_FAILED,
              projectId,
              error: `Failed to build project: ${buildStderr}`,
            }),
          },
        ],
      });
      return false;
    }

    await producer.send({
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
      messages: [
        {
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_BUILD_SUCCESS,
            projectId,
          }),
        },
      ],
    });

    // await producer.send({
    //   topic: TOPIC.CONTROL_TO_SERVING,
    //   messages: [
    //     {
    //       key: projectId,
    //       value: JSON.stringify({
    //         key: MESSAGE_KEYS.PROJECT_RUN,
    //         projectId,
    //       }),
    //     },
    //   ],
    // }); // TODO: May be needed later do not remove krda yrr

    return true;
  } catch (error) {
    await producer.send({
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
      messages: [
        {
          value: JSON.stringify({
            key: MESSAGE_KEYS.PROJECT_BUILD_FAILED,
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


export async function runNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "running",
    message: "Running application...",
  });

  await buildSource.invoke({ projectId: state.projectId });

  const { MESSAGE_KEYS, TOPIC } = await import("@elbavol/constants");
  const { producer } = await import("../../../index");

  await producer.send({
    topic: TOPIC.CONTROL_TO_SERVING,
    messages: [
      {
        key: state.projectId,
        value: JSON.stringify({
          key: MESSAGE_KEYS.PROJECT_RUN,
          projectId: state.projectId,
        }),
      },
    ],
  });

  sendSSEMessage(state.clientId, {
    type: "completed",
    message: "Workflow completed successfully",
  });

  return { completed: true };
}

