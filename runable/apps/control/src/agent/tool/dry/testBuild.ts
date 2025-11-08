import { tool } from "langchain";
import * as z from "zod";

const testBuildInput = z.object({
  action: z.enum(["build", "test"]),
  cwd: z.string().optional(),
});

export const testBuild = tool(
  async (input: z.infer<typeof testBuildInput>) => {
    const { action, cwd } = testBuildInput.parse(input);
    const workingDir = cwd ? `/app/shared/${cwd}` : "/app/shared";
    const command = action === "build" ? "bun run build" : "bun run test";

    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: workingDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

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
