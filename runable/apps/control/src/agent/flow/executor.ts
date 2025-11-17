import { sendSSEMessage } from "../../sse";
import { runAppNode } from "../tool/code/buildSource";
import { smartAnalyzeAndPlanNode } from "../tool/code/smartAnalyzer";
import { validateBuildNode } from "../tool/code/validateBuild";
import { getProjectContext } from "../tool/dry/getContext";
import { saveContextNode } from "../tool/dry/saveContext";
import { testBuildNode } from "../tool/dry/testBuild";
import { pushToR2Node } from "../tool/r2/push";
import { intelligentFixErrorsNode } from "../tool/code/intelligentErrorFixer";
import { fixToolArgs } from "../index";
import { allTools } from "../graphs/main";
import type { GraphState } from "../graphs/main";
import { agent } from "../client";

async function executeTools(state: GraphState): Promise<GraphState> {
  sendSSEMessage(state.clientId, {
    type: "executing",
    message: "Executing tools...",
  });

  process.env.PROJECT_ID = state.projectId;

  const toolCalls = state.toolCalls || [];
  const toolResults = [];
  let executedCount = 0;

  if (toolCalls.length > 0) {
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
        message: `Executing tool: ${toolCall.tool}`,
        toolName: toolCall.tool,
      });

      let toolAttempts = 0;
      let success = false;
      let result;

      while (toolAttempts < 2 && !success) {
        try {
          const tool = toolMap[toolCall.tool];
          if (tool) {
            if (!toolCall.args || Object.keys(toolCall.args).length === 0) {
              console.error(`Tool ${toolCall.tool} received empty arguments`);
              throw new Error(`Tool ${toolCall.tool} received empty arguments`);
            }

            let toolResult;
            try {
              toolResult = await tool.invoke(toolCall.args);
            } catch (schemaError) {
              console.error(`Schema validation error for ${toolCall.tool}:`, schemaError);
              const fixedArgs = fixToolArgs(toolCall.tool, toolCall.args);
              if (fixedArgs) {
                toolResult = await tool.invoke(fixedArgs);
              } else {
                throw schemaError;
              }
            }

            let validatedResult = toolResult;
            if (typeof toolResult === 'string') {
              try {
                validatedResult = JSON.parse(toolResult);
              } catch {
                validatedResult = { content: toolResult };
              }
            } else if (!toolResult || typeof toolResult !== 'object') {
              validatedResult = { result: toolResult };
            }

            if (validatedResult && typeof validatedResult === 'object' && Object.keys(validatedResult).length === 0) {
              validatedResult = { success: true, message: "Tool executed successfully" };
            }

            sendSSEMessage(state.clientId, {
              type: "tool_completed",
              message: `Tool ${toolCall.tool} completed successfully`,
              toolName: toolCall.tool,
              result: validatedResult,
            });
            result = { toolCall, result: validatedResult };
            success = true;
          } else {
            sendSSEMessage(state.clientId, {
              type: "tool_error",
              message: `Tool ${toolCall.tool} not found`,
              toolName: toolCall.tool,
              error: `Tool ${toolCall.tool} not found`,
            });
            result = {
              toolCall,
              error: `Tool ${toolCall.tool} not found`,
            };
          }
        } catch (error) {
          toolAttempts++;
          if (toolAttempts >= 2) {
            sendSSEMessage(state.clientId, {
              type: "tool_error",
              message: `Tool ${toolCall.tool} failed after retries`,
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
              message: `Retrying tool ${toolCall.tool} (attempt ${toolAttempts + 1})`,
              toolName: toolCall.tool,
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      toolResults.push(result);
      if (success) executedCount++;
    }
  } else {
    console.log(`[EXECUTE] No tool calls in plan`);
    sendSSEMessage(state.clientId, {
      type: "execution_complete",
      message: "No tools were specified in the plan",
      executedCount: 0,
      totalTools: 0,
    });
  }

  const executionSummary = executedCount > 0
    ? `Execution Results: ${executedCount} tools executed successfully`
    : `No tools executed - plan may be incomplete or encountered issues`;
  sendSSEMessage(state.clientId, {
    type: "execution_complete",
    message: executionSummary,
    executedCount,
    totalTools: toolResults.length,
  });

  const filesCreated = toolResults
    .filter(r => r?.toolCall?.tool === "createFile" && !r.error)
    .map(r => r?.toolCall?.args?.filePath);
  const filesModified = toolResults
    .filter(r => r?.toolCall?.tool === "updateFile" && !r.error)
    .map(r => r?.toolCall?.args?.filePath);

  const currentProgress = state.progressTracking || {
    filesCreated: [],
    filesModified: [],
    componentsBuilt: [],
    noProgressCount: 0,
    lastErrors: [],
  };

  const madeProgress = executedCount > 0 || filesCreated.length > 0 || filesModified.length > 0;

  return {
    ...state,
    toolResults,
    accumulatedResponses: [...state.accumulatedResponses, executionSummary],
    progressTracking: {
      filesCreated: [...currentProgress.filesCreated, ...filesCreated].filter(Boolean),
      filesModified: [...currentProgress.filesModified, ...filesModified].filter(Boolean),
      componentsBuilt: currentProgress.componentsBuilt,
      noProgressCount: madeProgress ? 0 : currentProgress.noProgressCount + 1,
      lastErrors: state.buildErrors || [],
    },
  };
}

function isStuck(state: GraphState): boolean {
  if (!state.progressTracking) return false;

  const progress = state.progressTracking;
  const noProgress = progress.noProgressCount >= 3;
  const sameErrors = state.buildErrors && state.buildErrors.length > 0 &&
    JSON.stringify(state.buildErrors) === JSON.stringify(progress.lastErrors);

  return noProgress || !!sameErrors;
}

export async function invokeAgentWithMemory(state: GraphState): Promise<GraphState> {
  const threadId = state.threadId || state.projectId;
  const messages = state.messages || [];
  
  const lastMessage = messages[messages.length - 1];
  if (messages.length === 0 || lastMessage?.content !== state.prompt) {
    messages.push({ role: "user", content: state.prompt });
  }

  try {
    sendSSEMessage(state.clientId, {
      type: "agent_thinking",
      message: "Agent processing with conversation history...",
    });

    const response = await agent.invoke(
      { messages },
      { configurable: { thread_id: threadId } }
    );

    const agentMessage = response.messages?.[response.messages.length - 1];
    const agentContent = agentMessage?.content;
    const agentResponse = typeof agentContent === "string" 
      ? agentContent 
      : Array.isArray(agentContent) 
        ? JSON.stringify(agentContent) 
        : "";

    sendSSEMessage(state.clientId, {
      type: "agent_response",
      message: "Agent responded with memory context",
      response: agentResponse,
    });

    const updatedMessages = [
      ...messages,
      { role: "assistant", content: agentResponse },
    ];

    return {
      ...state,
      messages: updatedMessages,
      threadId,
      accumulatedResponses: [...state.accumulatedResponses, agentResponse],
    };
  } catch (error) {
    console.error("Agent memory invocation error:", error);
    return {
      ...state,
      error: `Agent memory error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function executeMainFlow(initialState: GraphState): Promise<GraphState> {
  let state = { ...initialState };

  try {
    sendSSEMessage(state.clientId, {
      type: "flow_started",
      message: "Starting agent flow execution",
    });

    sendSSEMessage(state.clientId, {
      type: "context_loading",
      message: "Loading base template context from SHARED_DIR...",
    });

    const contextResult = await getProjectContext(state);
    state = { ...state, ...contextResult };

    if (state.context?.baseTemplate?.exists) {
      sendSSEMessage(state.clientId, {
        type: "context_loaded",
        message: `Base template found with ${state.context.metadata.totalFiles} files`,
        templateInfo: state.context.baseTemplate,
      });
    } else {
      sendSSEMessage(state.clientId, {
        type: "context_error",
        message: "Base template not found at SHARED_DIR",
      });
    }

    const analyzeResult = await smartAnalyzeAndPlanNode(state);
    state = { ...state, ...analyzeResult };

    while (!state.completed) {
      sendSSEMessage(state.clientId, {
        type: "execution_cycle",
        message: "Executing build and validation cycle...",
      });

      state = await executeTools(state);

      const validateResult = await validateBuildNode(state);
      state = { ...state, ...validateResult };

      if (state.buildStatus === "success") {
        sendSSEMessage(state.clientId, {
          type: "build_success",
          message: "Build validation successful, running tests...",
        });

        const testResult = await testBuildNode(state);
        state = { ...state, ...testResult };

        if (state.buildStatus === "tested") {
          sendSSEMessage(state.clientId, {
            type: "test_success",
            message: "Tests passed, pushing to R2...",
          });

          const pushResult = await pushToR2Node(state);
          state = { ...state, ...pushResult };

          const saveResult = await saveContextNode(state);
          state = { ...state, ...saveResult };

          const runResult = await runAppNode(state);
          state = { ...state, ...runResult };

          state.completed = true;
          sendSSEMessage(state.clientId, {
            type: "completed",
            message: "Agent flow completed successfully!",
          });
          break;
        } else {
          sendSSEMessage(state.clientId, {
            type: "test_failed",
            message: "Build succeeded but tests failed, will retry fixes...",
          });
        }
      } else if (state.buildStatus === "errors" && state.buildErrors && state.buildErrors.length > 0) {
        const fixableCount = state.errorAnalysis?.fixableCount || 0;

        sendSSEMessage(state.clientId, {
          type: "build_errors",
          message: `Build has ${state.buildErrors.length} errors, ${fixableCount} fixable`,
        });

        if (fixableCount > 0) {
          const fixResult = await intelligentFixErrorsNode(state);
          state = { ...state, ...fixResult };
        } else {
          sendSSEMessage(state.clientId, {
            type: "no_fixable_errors",
            message: "No fixable errors found, will attempt alternative approach",
          });
        }
      } else {
        sendSSEMessage(state.clientId, {
          type: "no_action_needed",
          message: "No errors found, completing successfully",
        });
        
        const testResult = await testBuildNode(state);
        state = { ...state, ...testResult };
        
        if (state.buildStatus === "tested") {
          const pushResult = await pushToR2Node(state);
          state = { ...state, ...pushResult };

          const saveResult = await saveContextNode(state);
          state = { ...state, ...saveResult };

          const runResult = await runAppNode(state);
          state = { ...state, ...runResult };
        }
        
        state.completed = true;
        break;
      }

      if (isStuck(state)) {
        sendSSEMessage(state.clientId, {
          type: "stuck_detected",
          message: "Agent appears stuck - no progress detected, attempting recovery",
        });
        state.error = "Agent stuck - no progress";
        break;
      }
    }

    return state;
  } catch (error) {
    console.error("Flow execution error:", error);
    state.error = error instanceof Error ? error.message : String(error);
    state.completed = false;
    return state;
  }
}
