import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const lineReplaceInput = z.object({
    filePath: z.string().describe("The path to the file to modify"),
    search: z.string().describe("The content to search for. Use '...' on its own line to indicate omitted sections for large code blocks."),
    firstReplacedLine: z.number().describe("First line number to replace (1-indexed)"),
    lastReplacedLine: z.number().describe("Last line number to replace (1-indexed)"),
    replace: z.string().describe("The new content to replace with"),
});

export const lineReplace = tool(
    async (input: z.infer<typeof lineReplaceInput>) => {
        const { filePath, search, firstReplacedLine, lastReplacedLine, replace } = lineReplaceInput.parse(input);
        const projectId = process.env.PROJECT_ID || "";
        const sharedDir = process.env.SHARED_DIR || "/app/shared";
        const projectDir = path.join(sharedDir, projectId);
        const fullPath = path.resolve(projectDir, filePath);

        try {
            if (!fs.existsSync(fullPath)) {
                return {
                    success: false,
                    error: `File does not exist: ${filePath}`,
                };
            }

            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");

            if (firstReplacedLine < 1 || lastReplacedLine > lines.length || firstReplacedLine > lastReplacedLine) {
                return {
                    success: false,
                    error: `Invalid line range: ${firstReplacedLine}-${lastReplacedLine}. File has ${lines.length} lines.`,
                };
            }

            const targetLines = lines.slice(firstReplacedLine - 1, lastReplacedLine);
            const targetContent = targetLines.join("\n");

            if (search.includes("\n...\n") || search.includes("\n...")) {
                const parts = search.split(/\n\.\.\.\n?/);

                if (parts.length === 2) {
                    const prefix = parts[0];
                    const suffix = parts[1];
                    const trimmedPrefix = prefix?.trim() || "";
                    const trimmedSuffix = suffix?.trim() || "";

                    if (!targetContent.trim().startsWith(trimmedPrefix)) {
                        return {
                            success: false,
                            error: `Content mismatch: Target section does not start with expected prefix.\nExpected prefix: "${trimmedPrefix.substring(0, 100)}..."\nActual start: "${targetContent.trim().substring(0, 100)}..."`,
                        };
                    }

                    if (trimmedSuffix && !targetContent.trim().endsWith(trimmedSuffix)) {
                        return {
                            success: false,
                            error: `Content mismatch: Target section does not end with expected suffix.\nExpected suffix: "...${trimmedSuffix.substring(Math.max(0, trimmedSuffix.length - 100))}"\nActual end: "...${targetContent.trim().substring(Math.max(0, targetContent.trim().length - 100))}"`,
                        };
                    }
                }
            } else {
                if (targetContent.trim() !== search.trim()) {
                    return {
                        success: false,
                        error: `Content mismatch: Target section does not match search content.\nExpected: "${search.substring(0, 200)}..."\nActual: "${targetContent.substring(0, 200)}..."`,
                    };
                }
            }

            const newLines = [
                ...lines.slice(0, firstReplacedLine - 1),
                replace,
                ...lines.slice(lastReplacedLine),
            ];

            const newContent = newLines.join("\n");
            fs.writeFileSync(fullPath, newContent, "utf8");

            return {
                success: true,
                message: `Replaced lines ${firstReplacedLine}-${lastReplacedLine} in ${filePath}`,
                linesReplaced: lastReplacedLine - firstReplacedLine + 1,
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to replace in file: ${(error as Error).message}`,
            };
        }
    },
    {
        name: "lineReplace",
        description: `Line-based search and replace tool for efficient file editing.

Use this tool to find and replace specific content in a file using explicit line numbers.
This is the PREFERRED tool for editing existing files (more efficient than rewriting entire files).

For large sections (>6 lines), use ellipsis (...) to include only the first few and last few key identifying lines:
- Include 2-3 lines at the start of the section
- Add "..." on its own line
- Include 2-3 lines at the end of the section

Example:
search: "  const handleSubmit = () => {\\n    setLoading(true);\\n...\\n    setLoading(false);\\n  };"
This matches any content between those prefix/suffix lines.

Critical guidelines:
1. Specify exact line numbers (1-indexed)
2. Use ellipsis for sections >6 lines
3. Content validation: prefix/suffix must match exactly
4. More efficient than updateFile for modifications`,
        schema: lineReplaceInput,
    },
);
