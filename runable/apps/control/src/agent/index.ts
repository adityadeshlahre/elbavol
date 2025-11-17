export { allTools, type GraphState } from "./graphs/main";
export { executeMainFlow, invokeAgentWithMemory } from "./flow/executor";
export { processPrompt } from "./process/prompt";
export { agent, checkpointer } from "./client";

export function fixToolArgs(toolName: string, args: any): any | null {
    switch (toolName) {
        case 'createFile':
            if (args.file && !args.filePath) {
                return {
                    filePath: args.file,
                    content: args.text || args.content || '',
                };
            }
            break;
        case 'readFile':
            if (args.file && !args.filePath) {
                return { filePath: args.file };
            }
            break;
        case 'listDir':
            if (args.path && !args.directory) {
                return { directory: args.path };
            }
            break;
        case 'getContext':
            if (args.id && !args.projectId) {
                return { projectId: args.id };
            }
            break;
        case 'saveContext':
            if (args.data && !args.context) {
                return {
                    context: args.data,
                    filePath: args.filePath || args.file || 'context.json',
                };
            }
            break;
    }
    return null;
}
