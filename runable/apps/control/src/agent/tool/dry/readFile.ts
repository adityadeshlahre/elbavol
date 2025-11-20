import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const readFileInput = z.object({
  filePath: z.string(),
  startLine: z.number().optional().describe("Starting line number (1-indexed)"),
  endLine: z.number().optional().describe("Ending line number (1-indexed)"),
});

export const readFile = tool(
  async (input: z.infer<typeof readFileInput>) => {
    const { filePath, startLine, endLine } = readFileInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const fullPath = path.resolve(projectDir, filePath);

    try {
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      const totalLines = lines.length;
      const stats = fs.statSync(fullPath);

      if (startLine !== undefined || endLine !== undefined) {
        const start = (startLine || 1) - 1; // Convert to 0-indexed
        const end = endLine || totalLines;

        if (start < 0 || end > totalLines || start >= end) {
          return {
            error: `Invalid line range: ${startLine}-${endLine}. File has ${totalLines} lines.`,
            metadata: { totalLines, sizeBytes: stats.size },
          };
        }

        const selectedLines = lines.slice(start, end);
        return {
          content: selectedLines.join("\n"),
          metadata: {
            totalLines,
            returnedLines: selectedLines.length,
            lineRange: `${startLine || 1}-${endLine || totalLines}`,
            sizeBytes: stats.size,
          },
        };
      }

      return {
        content,
        metadata: {
          totalLines,
          sizeBytes: stats.size,
        },
      };
    } catch (error) {
      return { error: `Failed to read file: ${(error as Error).message}` };
    }
  },
  {
    name: "readFile",
    description: "Reads the content of a file. Optionally specify line range (startLine, endLine) to read specific sections. Returns file metadata including total lines and size.",
    schema: readFileInput,
  },
);
