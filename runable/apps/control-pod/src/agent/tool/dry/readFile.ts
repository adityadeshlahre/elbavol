import { tool } from "langchain";
import * as z from "zod";
import fs from "fs";
import path from "path";

const readFileInput = z.object({
	filePath: z.string(),
});

export const readFile = tool(
	async (input: z.infer<typeof readFileInput>) => {
		const { filePath } = readFileInput.parse(input);
		const fullPath = path.resolve("/app/shared", filePath);

		try {
			const content = fs.readFileSync(fullPath, "utf8");
			return { content };
		} catch (error) {
			return { error: `Failed to read file: ${(error as Error).message}` };
		}
	},
	{
		name: "readFile",
		description: "Reads the content of a file.",
		schema: readFileInput,
	},
);