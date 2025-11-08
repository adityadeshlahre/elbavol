import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const fileInput = z.object({
  path: z.string(),
  data: z.string(),
});

const writeMultipleFileInput = z.object({
  files: z.array(fileInput),
});

export const writeMultipleFile = tool(
  async (input: z.infer<typeof writeMultipleFileInput>) => {
    const { files } = writeMultipleFileInput.parse(input);
    const results = [];

    for (const file of files) {
      const fullPath = path.resolve("/app/shared", file.path);
      try {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.data, "utf8");
        results.push({ path: file.path, success: true });
      } catch (error) {
        results.push({
          path: file.path,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return { results };
  },
  {
    name: "writeMultipleFile",
    description: "Creates or updates multiple files with specified content.",
    schema: writeMultipleFileInput,
  },
);
