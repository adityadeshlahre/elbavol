import { tool } from "langchain";
import * as z from "zod";
import fs from "fs";
import path from "path";

const createFileInput = z.object({
	filePath: z.string(),
	content: z.string(),
});

export const createFile = tool(
	async (input: z.infer<typeof createFileInput>) => {
		const { filePath, content } = createFileInput.parse(input);
		const fullPath = path.resolve("/app/shared", filePath);

		try {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
			fs.writeFileSync(fullPath, content, "utf8");
			return { success: true, message: `File created at ${filePath}` };
		} catch (error) {
			return {
				success: false,
				error: `Failed to create file: ${(error as Error).message}`,
			};
		}
	},
	{
		name: "createFile",
		description: "Creates a new file with the specified content.",
		schema: createFileInput,
	},
);
