import type { WorkflowState } from "@/agent/graphs/workflow";
import { sendSSEMessage } from "@/sse";
import { spawn } from "node:child_process";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const testBuildInput = z.object({
  action: z.enum(["build", "test"]),
  cwd: z.string().optional(),
});

export const testBuild = tool(
  async (input: z.infer<typeof testBuildInput>) => {
    const { action, cwd } = testBuildInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const workingDir = cwd ? path.join(projectDir, cwd) : projectDir;

    try {
      const installProc = spawn("bun", ["install"], { cwd: workingDir });
      const installExitCode: number = await new Promise((resolve) => {
        installProc.on("close", resolve);
        installProc.on("error", () => resolve(1));
      });

      if (installExitCode !== 0) {
        return {
          success: false,
          error: `Failed to install dependencies before ${action}`,
        };
      }

      const args = action === "build" ? ["run", "build"] : ["run", "test"];
      const proc = spawn("bun", args, { cwd: workingDir });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on("data", (d) => stdoutChunks.push(d));
      proc.stderr.on("data", (d) => stderrChunks.push(d));

      const exitCode: number = await new Promise((resolve) => {
        proc.on("close", resolve);
      });

      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      return {
        exitCode,
        stdout,
        stderr,
        success: exitCode === 0,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to ${action}: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "testBuild",
    description: "Runs build or test commands.",
    schema: testBuildInput,
  },
);


export async function testBuildNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "testing",
    message: "Running build test...",
  });

  const result = await testBuild.invoke({ action: "build" });

  if (result.success) {
    sendSSEMessage(state.clientId, {
      type: "test_success",
      message: "Build test passed",
    });
    return { buildStatus: "tested" };
  }

  sendSSEMessage(state.clientId, {
    type: "test_failed",
    message: "Build test failed",
  });

  const errorDetails = result.stderr || result.error || "Test build failed";
  console.log("[testBuildNode] Test build failed with error:", errorDetails.substring(0, 500));

  return {
    buildStatus: "errors",
    buildOutput: errorDetails,
    buildErrors: [{
      type: "test",
      severity: "major",
      message: errorDetails,
      fixable: true
    }],
  };
}
