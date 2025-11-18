import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const replaceInFileInput = z.object({
  filePath: z.string().describe("The path to the file to modify"),
  oldString: z.string().describe("The exact string to find and replace"),
  newString: z.string().describe("The new string to replace with"),
});

export const replaceInFile = tool(
  async (input: z.infer<typeof replaceInFileInput>) => {
    console.log("[replaceInFile] Received input:", JSON.stringify(input, null, 2));
    const { filePath, oldString, newString } = replaceInFileInput.parse(input);
    console.log("[replaceInFile] Parsed - filePath:", filePath, "oldString length:", oldString.length, "newString length:", newString.length);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const fullPath = path.resolve(projectDir, filePath);

    try {
      if (!fs.existsSync(fullPath)) {
        return { 
          success: false, 
          error: `File does not exist: ${filePath}` 
        };
      }

      const content = fs.readFileSync(fullPath, "utf8");
      
      if (!content.includes(oldString)) {
        return { 
          success: false, 
          error: `String not found in file. Looking for: "${oldString.substring(0, 100)}..."` 
        };
      }

      const newContent = content.replace(oldString, newString);
      fs.writeFileSync(fullPath, newContent, "utf8");

      return { 
        success: true, 
        message: `Replaced text in ${filePath}`,
        changes: 1
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to replace in file: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "replaceInFile",
    description: "Find and replace a string in a file. Use this to fix import statements, rename variables, or update specific code sections.",
    schema: replaceInFileInput,
  },
);
