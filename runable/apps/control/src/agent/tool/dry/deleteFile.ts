import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const deleteFileInput = z.object({
  filePath: z.string(),
});

export const deleteFile = tool(
  async (input: z.infer<typeof deleteFileInput>) => {
    const { filePath } = deleteFileInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const fullPath = path.resolve(projectDir, filePath);

    try {
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: "File does not exist" };
      }
      fs.unlinkSync(fullPath);
      return { success: true, message: `File deleted at ${filePath}` };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "deleteFile",
    description: "Deletes a file at the specified path.",
    schema: deleteFileInput,
  },
);
