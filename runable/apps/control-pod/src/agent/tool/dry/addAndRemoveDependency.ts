import { tool } from "langchain";
import * as z from "zod";

const dependencyInput = z.object({
	packages: z.array(z.string()),
	cwd: z.string().optional(),
});

export const addDependency = tool(
	async (input: z.infer<typeof dependencyInput>) => {
		const { packages, cwd } = dependencyInput.parse(input);
		const workingDir = cwd ? `/app/shared/${cwd}` : "/app/shared";
		const command = `bun add ${packages.join(" ")}`;

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

			return { exitCode, stdout, stderr, success: exitCode === 0 };
		} catch (error) {
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
		const workingDir = cwd ? `/app/shared/${cwd}` : "/app/shared";
		const command = `bun remove ${packages.join(" ")}`;

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
