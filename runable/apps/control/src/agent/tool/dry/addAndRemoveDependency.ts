import { tool } from "langchain";
import path from "path";
import * as z from "zod";
import { spawn } from "node:child_process";

const dependencyInput = z.object({
  packages: z.array(z.string()),
  cwd: z.string().optional(),
});

export const addDependency = tool(
  async (input: z.infer<typeof dependencyInput>) => {
    const { packages, cwd } = dependencyInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const workingDir = cwd ? path.join(projectDir, cwd) : projectDir;
    const command = `bun add ${packages.join(" ")}`;

    console.log(`[addDependency] Running: ${command}`);
    console.log(`[addDependency] Working dir: ${workingDir}`);
    console.log(`[addDependency] Packages: ${packages.join(", ")}`);

    try {
      const proc = spawn("sh", ["-c", command], { cwd: workingDir });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on("data", (d) => {
        const data = d.toString();
        console.log(`[addDependency] stdout: ${data}`);
        stdoutChunks.push(d);
      });
      
      proc.stderr.on("data", (d) => {
        const data = d.toString();
        console.log(`[addDependency] stderr: ${data}`);
        stderrChunks.push(d);
      });

      const exitCode: number = await new Promise((resolve) => {
        proc.on("close", resolve);
      });

      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      console.log(`[addDependency] Exit code: ${exitCode}`);
      console.log(`[addDependency] Success: ${exitCode === 0}`);

      if (exitCode === 0) {
        console.log(`[addDependency] ✅ Successfully installed: ${packages.join(", ")}`);
      } else {
        console.error(`[addDependency] ❌ Failed to install: ${packages.join(", ")}`);
        console.error(`[addDependency] stderr: ${stderr}`);
      }

      return { exitCode, stdout, stderr, success: exitCode === 0 };
    } catch (error) {
      console.error(`[addDependency] Exception:`, error);
      return {
        success: false,
        error: `Failed to add dependencies: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "addDependency",
    description: "Adds npm dependencies using bun.",
    schema: dependencyInput,
  },
);

export const removeDependency = tool(
  async (input: z.infer<typeof dependencyInput>) => {
    const { packages, cwd } = dependencyInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const workingDir = cwd ? path.join(projectDir, cwd) : projectDir;
    const command = `bun remove ${packages.join(" ")}`;

    try {
      const proc = spawn("sh", ["-c", command], { cwd: workingDir });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on("data", (d) => stdoutChunks.push(d));
      proc.stderr.on("data", (d) => stderrChunks.push(d));

      const exitCode: number = await new Promise((resolve) => {
        proc.on("close", resolve);
      });

      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      return { exitCode, stdout, stderr, success: exitCode === 0 };
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove dependencies: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "removeDependency",
    description: "Removes npm dependencies using bun.",
    schema: dependencyInput,
  },
);
