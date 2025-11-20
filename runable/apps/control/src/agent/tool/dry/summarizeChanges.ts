import type { WorkflowState } from "@/agent/graphs/workflow";
import { sendSSEMessage } from "@/sse";
import { model } from "@/agent/client";
import { saveContext } from "./saveContext";

export interface ChangeSummary {
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    commandsExecuted: string[];
    dependenciesAdded: string[];
    dependenciesRemoved: string[];
    buildStatus: string;
    summary: string;
}

function analyzeToolResults(toolResults: any[]): Partial<ChangeSummary> {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];
    const commandsExecuted: string[] = [];
    const dependenciesAdded: string[] = [];
    const dependenciesRemoved: string[] = [];

    for (const toolResult of toolResults) {
        const toolName = toolResult.toolCall?.tool;
        const args = toolResult.toolCall?.args;

        if (!toolName || !args) continue;

        switch (toolName) {
            case "createFile":
            case "writeMultipleFile":
                if (args.filePath) {
                    filesCreated.push(args.filePath);
                } else if (args.files && Array.isArray(args.files)) {
                    filesCreated.push(...args.files.map((f: any) => f.path));
                }
                break;

            case "updateFile":
            case "lineReplace":
            case "replaceInFile":
                if (args.filePath) {
                    filesModified.push(args.filePath);
                }
                break;

            case "deleteFile":
                if (args.filePath) {
                    filesDeleted.push(args.filePath);
                }
                break;

            case "executeCommand":
                if (args.command) {
                    commandsExecuted.push(args.command);
                }
                break;

            case "addDependency":
                if (args.packages && Array.isArray(args.packages)) {
                    dependenciesAdded.push(...args.packages);
                }
                break;

            case "removeDependency":
                if (args.packages && Array.isArray(args.packages)) {
                    dependenciesRemoved.push(...args.packages);
                }
                break;
        }
    }

    return {
        filesCreated: [...new Set(filesCreated)],
        filesModified: [...new Set(filesModified)],
        filesDeleted: [...new Set(filesDeleted)],
        commandsExecuted,
        dependenciesAdded: [...new Set(dependenciesAdded)],
        dependenciesRemoved: [...new Set(dependenciesRemoved)],
    };
}

async function generateNaturalLanguageSummary(
    userPrompt: string,
    changes: Partial<ChangeSummary>,
    buildStatus: string
): Promise<string> {
    const systemPrompt = `You are a technical summarizer. Generate a concise, natural language summary of changes made to a React application.

Focus on:
- What was created/modified/deleted
- What the changes accomplish
- Build status

Keep it 2-3 sentences maximum. Be clear and technical but readable.`;

    const userMessage = `User requested: "${userPrompt}"

Changes made:
- Files created: ${changes.filesCreated?.length || 0} (${changes.filesCreated?.join(", ") || "none"})
- Files modified: ${changes.filesModified?.length || 0} (${changes.filesModified?.join(", ") || "none"})
- Files deleted: ${changes.filesDeleted?.length || 0} (${changes.filesDeleted?.join(", ") || "none"})
- Commands executed: ${changes.commandsExecuted?.join(", ") || "none"}
- Dependencies added: ${changes.dependenciesAdded?.join(", ") || "none"}
- Dependencies removed: ${changes.dependenciesRemoved?.join(", ") || "none"}
- Build status: ${buildStatus}

Generate a concise summary of what was accomplished:`;

    try {
        const response = await model.invoke([
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
        ]);

        return response.text.trim();
    } catch (error) {
        console.error("Error generating summary:", error);
        const parts: string[] = [];
        if (changes.filesCreated && changes.filesCreated.length > 0) {
            parts.push(`Created ${changes.filesCreated.length} file(s)`);
        }
        if (changes.filesModified && changes.filesModified.length > 0) {
            parts.push(`modified ${changes.filesModified.length} file(s)`);
        }
        if (changes.dependenciesAdded && changes.dependenciesAdded.length > 0) {
            parts.push(`added ${changes.dependenciesAdded.join(", ")}`);
        }
        parts.push(`Build ${buildStatus}`);
        return parts.join(", ") + ".";
    }
}

export async function summarizeChangesNode(
    state: WorkflowState
): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "summarizing",
        message: "Generating change summary...",
    });

    try {
        const changes = analyzeToolResults(state.toolResults || []);
        const buildStatus = state.buildStatus || "unknown";
        const summary = await generateNaturalLanguageSummary(
            state.prompt,
            changes,
            buildStatus
        );

        const changeSummary: ChangeSummary = {
            filesCreated: changes.filesCreated || [],
            filesModified: changes.filesModified || [],
            filesDeleted: changes.filesDeleted || [],
            commandsExecuted: changes.commandsExecuted || [],
            dependenciesAdded: changes.dependenciesAdded || [],
            dependenciesRemoved: changes.dependenciesRemoved || [],
            buildStatus,
            summary,
        };

        const contextToSave = {
            ...state.context,
            lastExecution: {
                timestamp: new Date().toISOString(),
                userPrompt: state.prompt,
                ...changeSummary,
            },
        };

        await saveContext.invoke({
            context: contextToSave,
            filePath: `${state.projectId}/context.json`,
        });

        sendSSEMessage(state.clientId, {
            type: "summary_complete",
            message: `Summary: ${summary}`,
            changeSummary,
        });

        return { changeSummary };
    } catch (error) {
        console.error("Error in summarizeChangesNode:", error);
        sendSSEMessage(state.clientId, {
            type: "summary_error",
            message: `Failed to generate summary: ${(error as Error).message}`,
        });

        return {
            changeSummary: {
                filesCreated: [],
                filesModified: [],
                filesDeleted: [],
                commandsExecuted: [],
                dependenciesAdded: [],
                dependenciesRemoved: [],
                buildStatus: state.buildStatus || "unknown",
                summary: "Summary generation failed.",
            },
        };
    }
}
