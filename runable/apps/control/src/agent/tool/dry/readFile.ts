import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const readFileInput = z.object({
  filePath: z.string(),
});

export const readFile = tool(
  async (input: z.infer<typeof readFileInput>) => {
    const { filePath } = readFileInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const fullPath = path.resolve(projectDir, filePath);

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
