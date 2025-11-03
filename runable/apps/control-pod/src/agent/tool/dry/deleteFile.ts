import { tool } from "langchain";
import * as z from "zod";
import fs from "fs";
import path from "path";

const deleteFileInput = z.object({
	filePath: z.string(),
});

export const deleteFile = tool(
	async (input: z.infer<typeof deleteFileInput>) => {
		const { filePath } = deleteFileInput.parse(input);
		const fullPath = path.resolve("/app/shared", filePath);

		try {
			if (!fs.existsSync(fullPath)) {
				return { success: false, error: "File does not exist" };
			}
			fs.unlinkSync(fullPath);
			return { success: true, message: `File deleted at ${filePath}` };
		} catch (error) {
			return { success: false, error: `Failed to delete file: ${(error as Error).message}` };
		}
	},
	{
		name: "deleteFile",
		description: "Deletes a file at the specified path.",
		schema: deleteFileInput,
	},
);