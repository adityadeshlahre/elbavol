import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const updateFileInput = z.object({
  filePath: z.string(),
  content: z.string(),
});

export const updateFile = tool(
  async (input: z.infer<typeof updateFileInput>) => {
    const { filePath, content } = updateFileInput.parse(input);
    const fullPath = path.resolve("/app/shared", filePath);

    try {
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: "File does not exist" };
      }
      fs.writeFileSync(fullPath, content, "utf8");
      return { success: true, message: `File updated at ${filePath}` };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update file: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "updateFile",
    description: "Updates an existing file with new content.",
    schema: updateFileInput,
  },
);
