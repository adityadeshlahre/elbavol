import { sendSSEMessage } from "../../sse";
import { userGivenPromptCheckerNode } from "../tool/code/userGivenPromptChecker";
import { analyzeNode } from "../tool/code/smartAnalyzer";
import { enhancePromptNode } from "../tool/code/enhancePrompt";
import { planerNode } from "../tool/code/plannerPrompt";
import { getContextNode } from "../tool/dry/getContext";
import { validateNode } from "../tool/code/validateBuild";
import { testBuildNode } from "../tool/dry/testBuild";
import { fixErrorsNode } from "../tool/code/intelligentErrorFixer";
import { pushNode } from "../tool/r2/push";
import { saveNode } from "../tool/dry/saveContext";
import { runNode } from "../tool/code/buildSource";
import { allTools } from "./main";

export interface WorkflowState {
    projectId: string;
    prompt: string;
    clientId: string;
    analysis?: any;
    enhancedPrompt?: string;
    plan?: string;
    toolCalls?: any[];
    context?: any;
    previousContext?: any;
    toolResults?: any[];
    buildStatus?: "pending" | "success" | "errors" | "tested";
    buildErrors?: any[];
    buildOutput?: string;
    errorAnalysis?: any;
    fixAttempts: number;
    completed: boolean;
    error?: string;
    messages: Array<{ role: string; content: string }>;
    threadId: string;
    toolsExecuted?: boolean;
    fixesApplied?: boolean;
    noFixesAvailable?: boolean;
}

async function executeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    if (state.fixesApplied) {
        sendSSEMessage(state.clientId, {
            type: "skipping_execution",
            message: "Skipping tool execution, re-validating after fixes...",
        });
        return { fixesApplied: false, toolsExecuted: true };
    }

    sendSSEMessage(state.clientId, {
        type: "executing",
        message: "Executing tools...",
    });

    process.env.PROJECT_ID = state.projectId;

    const toolCalls = state.toolCalls || [];
    const toolResults = [];
    const toolMap = allTools.reduce(
        (acc, tool) => {
            acc[tool.name] = tool;
            return acc;
        },
        {} as Record<string, any>,
    );

    for (const toolCall of toolCalls) {
        sendSSEMessage(state.clientId, {
            type: "tool_executing",
            message: `Executing: ${toolCall.tool}`,
            toolName: toolCall.tool,
        });

        let attempts = 0;
        let success = false;
        let result;

        while (attempts < 2 && !success) {
            try {
                const tool = toolMap[toolCall.tool];
                if (!tool) {
                    throw new Error(`Tool ${toolCall.tool} not found`);
                }

                const toolResult = await tool.invoke(toolCall.args);

                sendSSEMessage(state.clientId, {
                    type: "tool_completed",
                    message: `Completed: ${toolCall.tool}`,
                    toolName: toolCall.tool,
                });

                result = { toolCall, result: toolResult };
                success = true;
            } catch (error) {
                attempts++;
                if (attempts >= 2) {
                    sendSSEMessage(state.clientId, {
                        type: "tool_error",
                        message: `Failed: ${toolCall.tool}`,
                        toolName: toolCall.tool,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    result = {
                        toolCall,
                        error: error instanceof Error ? error.message : String(error),
                    };
                } else {
                    sendSSEMessage(state.clientId, {
                        type: "tool_retry",
                        message: `Retrying: ${toolCall.tool}`,
                        toolName: toolCall.tool,
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        toolResults.push(result);
    }

    sendSSEMessage(state.clientId, {
        type: "execution_complete",
        message: `Executed ${toolResults.length} tools`,
    });

    return { toolResults, toolsExecuted: true };
}

export async function executeWorkflow(initialState: WorkflowState): Promise<WorkflowState> {
    let state = { ...initialState };

    try {
        sendSSEMessage(state.clientId, {
            type: "workflow_started",
            message: "Starting LangGraph workflow execution",
        });

        const promptCheckResult = await userGivenPromptCheckerNode(state);
        state = { ...state, ...promptCheckResult };

        if (state.error) {
            throw new Error(`Prompt validation failed: ${state.error}`);
        }

        const contextResult = await getContextNode(state);
        state = { ...state, ...contextResult };

        if (state.error) {
            throw new Error(`Failed to get context: ${state.error}`);
        }

        const analysisResult = await analyzeNode(state);
        state = { ...state, ...analysisResult };

        if (state.error) {
            throw new Error(`Failed to analyze: ${state.error}`);
        }

        const enhanceResult = await enhancePromptNode(state);
        state = { ...state, ...enhanceResult };

        if (state.error) {
            throw new Error(`Failed to enhance prompt: ${state.error}`);
        }

        const planResult = await planerNode(state);
        state = { ...state, ...planResult };

        if (state.error) {
            throw new Error(`Failed to create plan: ${state.error}`);
        }

        while (!state.completed && !state.error) {
            const executeResult = await executeNode(state);
            state = { ...state, ...executeResult };

            const validateResult = await validateNode(state);
            state = { ...state, ...validateResult };

            if (state.buildStatus === "success") {
                const testResult = await testBuildNode(state);
                state = { ...state, ...testResult };

                if (state.buildStatus === "tested") {
                    sendSSEMessage(state.clientId, {
                        type: "build_success",
                        message: "Build test passed, proceeding to deployment",
                    });

                    const pushResult = await pushNode(state);
                    state = { ...state, ...pushResult };

                    const saveResult = await saveNode(state);
                    state = { ...state, ...saveResult };

                    const runResult = await runNode(state);
                    state = { ...state, ...runResult };
                    break;
                }
                const fixResult = await fixErrorsNode(state);
                state = { ...state, ...fixResult };
            } else if (state.buildStatus === "errors" && state.buildErrors && state.buildErrors.length > 0) {
                const fixResult = await fixErrorsNode(state);
                state = { ...state, ...fixResult };
            } else {
                const errorMsg = "Build validation did not return success or errors status";
                console.error(errorMsg, { buildStatus: state.buildStatus, buildErrors: state.buildErrors });
                state.error = errorMsg;
                break;
            }

            if (state.noFixesAvailable) {
                state.error = "Unable to generate fixes for the errors. The LLM could not determine how to fix the issues.";
                sendSSEMessage(state.clientId, {
                    type: "error",
                    message: state.error,
                });
                break;
            }
        }

        if (!state.completed && !state.error) {
            state.error = "Workflow ended without completion or error";
        }

        return state;
    } catch (error) {
        console.error("Workflow execution error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        sendSSEMessage(state.clientId, {
            type: "error",
            message: `Workflow failed: ${errorMessage}`,
        });

        state.error = errorMessage;
        state.completed = false;
        return state;
    }
}
