import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const renameFileInput = z.object({
    oldPath: z.string().describe("The current path of the file to rename"),
    newPath: z.string().describe("The new path for the file"),
});

export const renameFile = tool(
    async (input: z.infer<typeof renameFileInput>) => {
        const { oldPath, newPath } = renameFileInput.parse(input);
        const projectId = process.env.PROJECT_ID || "";
        const sharedDir = process.env.SHARED_DIR || "/app/shared";
        const projectDir = path.join(sharedDir, projectId);
        const fullOldPath = path.resolve(projectDir, oldPath);
        const fullNewPath = path.resolve(projectDir, newPath);

        try {
            if (!fs.existsSync(fullOldPath)) {
                return {
                    success: false,
                    error: `File does not exist: ${oldPath}`,
                };
            }

            if (fs.existsSync(fullNewPath)) {
                return {
                    success: false,
                    error: `Target file already exists: ${newPath}`,
                };
            }

            const newDir = path.dirname(fullNewPath);
            if (!fs.existsSync(newDir)) {
                fs.mkdirSync(newDir, { recursive: true });
            }

            fs.renameSync(fullOldPath, fullNewPath);

            return {
                success: true,
                message: `Renamed ${oldPath} to ${newPath}`,
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to rename file: ${(error as Error).message}`,
            };
        }
    },
    {
        name: "renameFile",
        description: "Renames or moves a file to a new location. Creates parent directories if needed. Use this instead of creating a new file and deleting the old one.",
        schema: renameFileInput,
    },
);
