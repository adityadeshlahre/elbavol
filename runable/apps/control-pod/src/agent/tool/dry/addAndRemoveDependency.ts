import { tool } from "langchain";
import * as z from "zod";

const addAndRemoveDependencyInput = z.object({
	action: z.enum(["add", "remove"]),
	packages: z.array(z.string()),
	cwd: z.string().optional(),
});

export const addAndRemoveDependency = tool(
	async (input: z.infer<typeof addAndRemoveDependencyInput>) => {
		const { action, packages, cwd } = addAndRemoveDependencyInput.parse(input);
		const workingDir = cwd ? `/app/shared/${cwd}` : "/app/shared";
		const command = action === "add" ? `bun add ${packages.join(" ")}` : `bun remove ${packages.join(" ")}`;

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
			return { success: false, error: `Failed to ${action} dependencies: ${(error as Error).message}` };
		}
	},
	{
		name: "addAndRemoveDependency",
		description: "Adds or removes npm dependencies using bun.",
		schema: addAndRemoveDependencyInput,
	},
);