import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";
import { glob } from "glob";
import { IGNORE_PATTERNS } from "./getContext";

const listDirInput = z.object({
  directory: z.string().optional().default("."),
  globPattern: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts', '*.{ts,tsx}', 'src/**')"),
});

export const listDir = tool(
  async (input: z.infer<typeof listDirInput>) => {
    const { directory, globPattern } = listDirInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const fullPath = path.resolve(projectDir, directory);

    try {
      let items;

      if (globPattern) {
        const files = await glob(globPattern, {
          cwd: fullPath,
          nodir: false,
          absolute: false,
          ignore: IGNORE_PATTERNS,
        });

        items = files.map((file: string) => {
          const itemPath = path.join(fullPath, file);
          const stats = fs.statSync(itemPath);
          return {
            name: file,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            sizeBytes: stats.isFile() ? stats.size : undefined,
          };
        });
      } else {
        const dirItems = fs.readdirSync(fullPath, { withFileTypes: true });
        items = dirItems.map((item) => {
          const itemPath = path.join(fullPath, item.name);
          const stats = fs.statSync(itemPath);
          return {
            name: item.name,
            isDirectory: item.isDirectory(),
            isFile: item.isFile(),
            sizeBytes: item.isFile() ? stats.size : undefined,
          };
        });
      }

      return {
        message: `Found ${items.length} items in ${directory}${globPattern ? ` matching "${globPattern}"` : ""}`,
        items,
        totalItems: items.length,
      };
    } catch (error) {
      console.error(`Error listing directory ${fullPath}:`, error);
      return {
        error: `Failed to list directory: ${(error as Error).message}`,
        items: [],
      };
    }
  },
  {
    name: "listDir",
    description: "Lists the contents of a directory with optional glob pattern filtering. Returns file/directory information including sizes.",
    schema: listDirInput,
  },
);
