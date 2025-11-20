import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";
import { glob } from "glob";
import { IGNORE_PATTERNS } from "./getContext";

const grepSearchInput = z.object({
    pattern: z.string().describe("The regex pattern to search for within file contents"),
    globPattern: z.string().optional().describe("Glob pattern to filter which files are searched (e.g., '*.ts', '*.{ts,tsx}', 'src/**')"),
    searchPath: z.string().optional().describe("The directory to search within (relative to project root)"),
});

export const grepSearch = tool(
    async (input: z.infer<typeof grepSearchInput>) => {
        const { pattern, globPattern, searchPath } = grepSearchInput.parse(input);
        const projectId = process.env.PROJECT_ID || "";
        const sharedDir = process.env.SHARED_DIR || "/app/shared";
        const projectDir = path.join(sharedDir, projectId);
        const searchDir = searchPath ? path.resolve(projectDir, searchPath) : projectDir;

        try {
            const globPatternToUse = globPattern || "**/*";
            const files = await glob(globPatternToUse, {
                cwd: searchDir,
                nodir: true,
                absolute: false,
                ignore: IGNORE_PATTERNS,
            });

            const regex = new RegExp(pattern, "i");
            const results: Array<{ file: string; line: number; content: string; match: string }> = [];
            const maxResults = 200;

            for (const file of files) {
                if (results.length >= maxResults) break;

                const fullPath = path.join(searchDir, file);

                const stats = fs.statSync(fullPath);
                if (stats.size > 1000000) continue;

                try {
                    const content = fs.readFileSync(fullPath, "utf8");
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        if (results.length >= maxResults) break;

                        const line = lines[i];
                        if (!line) continue;

                        const match = line.match(regex);

                        if (match) {
                            results.push({
                                file: searchPath ? path.join(searchPath, file) : file,
                                line: i + 1,
                                content: line.trim(),
                                match: match[0],
                            });
                        }
                    }
                } catch (readError) {
                    continue;
                }
            }

            return {
                success: true,
                message: `Found ${results.length} matches for pattern "${pattern}"`,
                matches: results,
                truncated: results.length >= maxResults,
            };
        } catch (error) {
            return {
                success: false,
                error: `Grep search failed: ${(error as Error).message}`,
                matches: [],
            };
        }
    },
    {
        name: "grepSearch",
        description: `Regex-based code search across repository files.

Searches for regex patterns within file contents and returns matching lines with context.

Primary use cases:
- Find function definitions: 'function\\s+myFunction' or 'const\\s+\\w+\\s*='
- Locate imports/exports: 'import.*from' or 'export\\s+(default|\\{)'
- Search for classes: 'class\\s+ComponentName' or 'interface\\s+\\w+'
- Find API calls: 'fetch\\(' or 'api\\.(get|post)'
- Track usage: component names, variables, method calls
- Find specific text: 'User Admin' or 'TODO'

Search strategies:
- Use glob patterns to focus on relevant file types (*.ts, *.jsx, src/**)
- Start broad, then narrow with more specific patterns
- Case-insensitive matching, max 200 results returned`,
        schema: grepSearchInput,
    },
);
