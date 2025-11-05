import { tool } from "langchain";
import * as z from "zod";
import fs from "fs";
import path from "path";

const listDirInput = z.object({
	directory: z.string().optional().default("."),
});

export const listDir = tool(
	async (input: z.infer<typeof listDirInput>) => {
		const { directory } = listDirInput.parse(input);
		const fullPath = path.resolve("/app/shared", directory);

		try {
			const items = fs.readdirSync(fullPath, { withFileTypes: true });
			const result = items.map((item) => ({
				name: item.name,
				isDirectory: item.isDirectory(),
				isFile: item.isFile(),
			}));
			return result;
		} catch (error) {
			return { error: `Failed to list directory: ${(error as Error).message}` };
		}
	},
	{
		name: "listDir",
		description:
			"Lists the contents of a directory, including files and subdirectories.",
		schema: listDirInput,
	},
);
