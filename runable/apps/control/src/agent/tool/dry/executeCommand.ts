import { spawn } from "node:child_process";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const executeCommandInput = z.object({
  command: z.string(),
  cwd: z.string().optional(),
});

export const executeCommand = tool(
  async (input: z.infer<typeof executeCommandInput>) => {
    const { command, cwd } = executeCommandInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const workingDir = cwd ? path.join(projectDir, cwd) : projectDir;

    try {
      console.log(`[executeCommand] Running: ${command}`);
      console.log(`[executeCommand] Working dir: ${workingDir}`);

      let modifiedCommand = command;
      if (command.includes('bunx --bun shadcn@latest add')) {
        modifiedCommand = `${command} -y --overwrite`;
      }

      const proc = spawn(modifiedCommand, [], {
        cwd: workingDir,
        shell: true,
        env: { ...process.env }
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout?.on("data", (d: Buffer) => stdoutChunks.push(d));
      proc.stderr?.on("data", (d: Buffer) => stderrChunks.push(d));

      const exitCode: number = await new Promise((resolve) => {
        proc.on("close", (code) => resolve(code ?? 1));
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
        error: `Failed to execute command: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "executeCommand",
    description: "Executes a shell command in the specified directory.",
    schema: executeCommandInput,
  },
);
