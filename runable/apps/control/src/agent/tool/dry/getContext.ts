import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const getContextInput = z.object({
  files: z.array(z.string()),
});

export const getContext = tool(
  async (input: z.infer<typeof getContextInput>) => {
    const { files } = getContextInput.parse(input);
    const context: Record<string, any> = {};

    for (const file of files) {
      const fullPath = path.resolve("/app/shared", file);
      try {
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf8");
          context[file] = content;
        } else {
          context[file] = "File not found";
        }
      } catch (error) {
        context[file] = `Error reading file: ${(error as Error).message}`;
      }
    }

    return { context };
  },
  {
    name: "getContext",
    description: "Retrieves the content of multiple files for context.",
    schema: getContextInput,
  },
);
