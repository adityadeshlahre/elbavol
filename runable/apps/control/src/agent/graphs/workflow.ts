import { sendSSEMessage } from "../../sse";
import { smartAnalyzeAndPlan } from "../tool/code/smartAnalyzer";
import { getContext } from "../tool/dry/getContext";
import { validateBuild } from "../tool/code/validateBuild";
import { testBuild } from "../tool/dry/testBuild";
import { intelligentErrorFixer } from "../tool/code/intelligentErrorFixer";
import { pushFilesToR2 } from "../tool/r2/push";
import { saveContext } from "../tool/dry/saveContext";
import { buildSource } from "../tool/code/buildSource";
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
    toolResults?: any[];
    buildStatus?: "pending" | "success" | "errors" | "tested";
    buildErrors?: any[];
    errorAnalysis?: any;
    fixAttempts: number;
    completed: boolean;
    error?: string;
    messages: Array<{ role: string; content: string }>;
    threadId: string;
}

async function analyzeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "analyzing",
        message: "Analyzing prompt and creating execution plan...",
    });

    const result = await smartAnalyzeAndPlan.invoke({
        prompt: state.prompt,
        projectId: state.projectId,
        context: state.context,
    });

    if (!result.success) {
        return {
            error: result.error || "Analysis failed",
            analysis: { needsEnhancement: false, intent: "general" },
        };
    }

    sendSSEMessage(state.clientId, {
        type: "analysis_complete",
        message: `Analysis complete: ${result.analysis.intent}`,
        analysis: result.analysis,
    });

    return {
        analysis: result.analysis,
        enhancedPrompt: result.enhancedPrompt,
        plan: result.plan,
        toolCalls: result.toolCalls,
    };
}

async function getContextNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "loading_context",
        message: "Loading project context...",
    });

    const result = await getContext.invoke({ projectId: state.projectId });

    if (result.context?.baseTemplate?.exists) {
        sendSSEMessage(state.clientId, {
            type: "context_loaded",
            message: `Context loaded: ${result.context.metadata.totalFiles} files`,
        });
    }

    return { context: result.context };
}

async function executeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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

    return { toolResults };
}

async function validateNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "validating",
        message: "Validating build...",
    });

    const result = await validateBuild.invoke({
        projectId: state.projectId,
        userInstructions: state.prompt,
    }) as any;

    const errorCount = result.errors?.length || 0;

    if (result.success || errorCount === 0) {
        sendSSEMessage(state.clientId, {
            type: "validation_success",
            message: "Build validation passed - no errors found",
        });
        return {
            buildStatus: "success",
            buildErrors: [],
            error: undefined,
        };
    }

    sendSSEMessage(state.clientId, {
        type: "validation_failed",
        message: `Build validation failed with ${errorCount} error(s)`,
        errors: result.errors,
        errorAnalysis: result.errorAnalysis,
    });

    return {
        buildStatus: "errors",
        buildErrors: result.errors || [],
        errorAnalysis: result.errorAnalysis,
        error: result.error || `Build has ${errorCount} errors`,
    };
}

async function testBuildNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "testing",
        message: "Running build test...",
    });

    const result = await testBuild.invoke({ action: "build" });

    if (result.success) {
        sendSSEMessage(state.clientId, {
            type: "test_success",
            message: "Build test passed",
        });
        return { buildStatus: "tested" };
    }

    sendSSEMessage(state.clientId, {
        type: "test_failed",
        message: "Build test failed",
    });

    return {
        buildStatus: "errors",
        error: result.stderr || result.error,
    };
}

async function fixErrorsNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "fixing",
        message: "Analyzing and fixing errors...",
    });

    const fixPlanResult = await intelligentErrorFixer.invoke({
        projectId: state.projectId,
        errors: state.buildErrors || [],
        errorAnalysis: state.errorAnalysis,
        context: state.context,
        previousAttempts: [],
    }) as any;

    if (!fixPlanResult.success || !fixPlanResult.fixPlan) {
        sendSSEMessage(state.clientId, {
            type: "fixing_failed",
            message: "Failed to generate fix plan",
        });
        return {
            fixAttempts: state.fixAttempts + 1,
        };
    }

    sendSSEMessage(state.clientId, {
        type: "fix_plan_generated",
        message: `Generated ${fixPlanResult.fixPlan.length} fix actions`,
    });

    const toolMap = allTools.reduce(
        (acc, tool) => {
            acc[tool.name] = tool;
            return acc;
        },
        {} as Record<string, any>,
    );

    let successCount = 0;
    for (const action of fixPlanResult.fixPlan.slice(0, 10)) {
        try {
            sendSSEMessage(state.clientId, {
                type: "executing_fix",
                message: action.description || `Executing ${action.action}`,
            });

            const tool = toolMap[action.action];
            if (!tool) {
                console.warn(`Tool ${action.action} not found in toolMap`);
                if (action.action === "addDependency" && action.details?.packages) {
                    const addDepTool = toolMap["addDependency"];
                    if (addDepTool) {
                        const result = await addDepTool.invoke({
                            packages: action.details.packages,
                            cwd: action.details.cwd,
                        });
                        if (result.success) successCount++;
                    }
                } else if (action.action === "executeCommand" && action.details?.command) {
                    const cmdTool = toolMap["executeCommand"];
                    if (cmdTool) {
                        const result = await cmdTool.invoke({
                            command: action.details.command,
                            cwd: action.details.cwd,
                        });
                        if (result.success) successCount++;
                    }
                }
                continue;
            }

            const result = await tool.invoke(action.details);
            if (result?.success !== false) {
                successCount++;
                sendSSEMessage(state.clientId, {
                    type: "fix_success",
                    message: `✓ ${action.description || action.action}`,
                });
            }
        } catch (error) {
            console.error(`Fix action failed:`, error);
            sendSSEMessage(state.clientId, {
                type: "fix_error",
                message: `✗ ${action.description || action.action}: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    sendSSEMessage(state.clientId, {
        type: "fixing_complete",
        message: `Applied ${successCount}/${fixPlanResult.fixPlan.length} fixes successfully`,
    });

    return { fixAttempts: state.fixAttempts + 1 };
}

async function pushNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "pushing",
        message: "Pushing to storage...",
    });

    await pushFilesToR2.invoke({
        projectId: state.projectId,
        bucketName: "elbavol",
    });

    return {};
}

async function saveNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "saving",
        message: "Saving context...",
    });

    await saveContext.invoke({
        context: state.context,
        filePath: `${state.projectId}/context.json`,
    });

    return {};
}

async function runNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "running",
        message: "Running application...",
    });

    await buildSource.invoke({ projectId: state.projectId });

    const { MESSAGE_KEYS, TOPIC } = await import("@elbavol/constants");
    const { producer } = await import("../../index");

    await producer.send({
        topic: TOPIC.CONTROL_TO_SERVING,
        messages: [
            {
                key: state.projectId,
                value: JSON.stringify({
                    key: MESSAGE_KEYS.PROJECT_RUN,
                    projectId: state.projectId,
                }),
            },
        ],
    });

    sendSSEMessage(state.clientId, {
        type: "completed",
        message: "Workflow completed successfully",
    });

    return { completed: true };
}

export async function executeWorkflow(initialState: WorkflowState): Promise<WorkflowState> {
    let state = { ...initialState };

    try {
        sendSSEMessage(state.clientId, {
            type: "workflow_started",
            message: "Starting LangGraph workflow execution",
        });

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

        while (!state.completed && !state.error) {
            const executeResult = await executeNode(state);
            state = { ...state, ...executeResult };

            const validateResult = await validateNode(state);
            state = { ...state, ...validateResult };

            if (state.buildStatus === "success") {
                const testResult = await testBuildNode(state);
                state = { ...state, ...testResult };

                if (state.buildStatus === "tested") {
                    const pushResult = await pushNode(state);
                    state = { ...state, ...pushResult };

                    const saveResult = await saveNode(state);
                    state = { ...state, ...saveResult };

                    const runResult = await runNode(state);
                    state = { ...state, ...runResult };
                    break;
                } else {
                    const fixResult = await fixErrorsNode(state);
                    state = { ...state, ...fixResult };
                }
            } else if (state.buildStatus === "errors" && state.buildErrors && state.buildErrors.length > 0) {
                const fixResult = await fixErrorsNode(state);
                state = { ...state, ...fixResult };
            } else {
                const errorMsg = "Build validation did not return success or errors status";
                console.error(errorMsg, { buildStatus: state.buildStatus, buildErrors: state.buildErrors });
                state.error = errorMsg;
                break;
            }

            if (state.fixAttempts > 20) {
                state.error = "Maximum fix attempts (20) reached";
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
