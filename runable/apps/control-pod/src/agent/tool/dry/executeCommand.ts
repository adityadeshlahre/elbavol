import { tool } from "langchain";
import * as z from "zod";

const executeCommandInput = z.object({
	command: z.string(),
	cwd: z.string().optional(),
});

export const executeCommand = tool(
	async (input: z.infer<typeof executeCommandInput>) => {
		const { command, cwd } = executeCommandInput.parse(input);
		const workingDir = cwd ? `/app/shared/${cwd}` : "/app/shared";

		try {
			const proc = Bun.spawn(["sh", "-c", command], { cwd: workingDir, stdout: "pipe", stderr: "pipe" });
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
			return { success: false, error: `Failed to execute command: ${(error as Error).message}` };
		}
	},
	{
		name: "executeCommand",
		description: "Executes a shell command in the specified directory.",
		schema: executeCommandInput,
	},
);