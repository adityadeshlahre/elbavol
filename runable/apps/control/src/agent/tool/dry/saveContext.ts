import { tool } from "langchain";
import * as z from "zod";
import fs from "fs";
import path from "path";

const saveContextInput = z.object({
	context: z.any(),
	filePath: z.string().optional().default("context.json"),
});

export const saveContext = tool(
	async (input: z.infer<typeof saveContextInput>) => {
		const { context, filePath } = saveContextInput.parse(input);
		const fullPath = path.resolve("/app/shared", filePath);

		try {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
			fs.writeFileSync(fullPath, JSON.stringify(context, null, 2), "utf8");
			return { success: true, message: `Context saved to ${filePath}` };
		} catch (error) {
			return { success: false, error: `Failed to save context: ${(error as Error).message}` };
		}
	},
	{
		name: "saveContext",
		description: "Saves context data to a file.",
		schema: saveContextInput,
	},
);