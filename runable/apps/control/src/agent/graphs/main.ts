import { Annotation, END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { sendSSEMessage } from "../../sse";
import { analyzePrompt, promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { buildSource, runAppNode } from "../tool/code/buildSource";
import { enhancePromptNode } from "../tool/code/enhancePrompt";
import { planChanges } from "../tool/code/plannerPrompt";
import { smartAnalyzeAndPlanNode } from "../tool/code/smartAnalyzer";
import { validateBuild, validateBuildNode } from "../tool/code/validateBuild";
import { getContext, getProjectContext } from "../tool/dry/getContext";
import { saveContext, saveContextNode } from "../tool/dry/saveContext";
import { testBuild, testBuildNode } from "../tool/dry/testBuild";
import { pushFilesToR2, pushToR2Node } from "../tool/r2/push";
import { addDependency, removeDependency } from "../tool/dry/addAndRemoveDependency";
import { checkMissingPackage } from "../tool/dry/checkMissingPackage";
import { createFile } from "../tool/dry/createFile";
import { deleteFile } from "../tool/dry/deleteFile";
import { executeCommand } from "../tool/dry/executeCommand";
import { listDir } from "../tool/dry/listDir";
import { readFile } from "../tool/dry/readFile";
import { updateFile } from "../tool/dry/updateFile";
import { writeMultipleFile } from "../tool/dry/writeMultipleFile";
import { checkUserGivenPrompt } from "../tool/code/userGivenPromptChecker";
import { intelligentFixErrorsNode } from "../tool/code/intelligentErrorFixer";
import { fixToolArgs } from "../index";

export const allTools = [
  promptAnalyzer,
  buildSource,
  checkUserGivenPrompt,
  validateBuild,
  addDependency,
  removeDependency,
  checkMissingPackage,
  createFile,
  deleteFile,
  executeCommand,
  getContext,
  listDir,
  readFile,
  saveContext,
  testBuild,
  updateFile,
  writeMultipleFile,
  pushFilesToR2,
];

export const GraphAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  prompt: Annotation<string>(),
  analysis: Annotation<any>(),
  enhancedPrompt: Annotation<string>(),
  generatedPlan: Annotation<string>(),
  context: Annotation<any>(),
  toolResults: Annotation<any[]>(),
  buildStatus: Annotation<string>(),
  buildErrors: Annotation<any[]>(),
  errorAnalysis: Annotation<any>(),
  progressTracking: Annotation<any>(),
  iterations: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  completed: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  error: Annotation<string>(),
  pushResult: Annotation<any>(),
  clientId: Annotation<string>(),
  accumulatedResponses: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type GraphState = typeof GraphAnnotation.State;


async function executeTools(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "executing",
    message: "Executing tools...",
  });

  process.env.PROJECT_ID = state.projectId; // remove this in prod

  const { model } = await import("../../agent/client");
  const { SYSTEM_PROMPTS } = await import("../../prompt");

  let modelWithTools;
  try {
    modelWithTools = model.bindTools(allTools);
  } catch (error) {
    console.error("Error binding tools:", error);
    throw error;
  }

  let result;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      result = await modelWithTools.invoke([
        {
          role: "system",
          content: SYSTEM_PROMPTS.BUILDER_PROMPT,
        },
        {
          role: "user",
          content: `Execute this plan: ${state.generatedPlan}\n\nContext: ${JSON.stringify(state.context)}\n\nIMPORTANT: You MUST use the available tools to execute this plan. Do NOT respond with text - use the tools to create files, read files, and perform all operations.

Project Status: ${state.context?.files?.length > 0 ? 'Existing project with files' : 'New/Empty project - you need to create the initial structure'}

If this is a new project, START by creating the necessary files according to the plan. If it's an existing project, use listDir and readFile to understand the structure first.`,
        },
      ]);
      break;
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw error;
      }
      const delay = Math.pow(2, attempts) * 1000;
      sendSSEMessage(state.clientId, {
        type: "executing",
        message: `Model call failed, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const toolResults = [];
  let executedCount = 0;

  if (result?.tool_calls && result.tool_calls.length > 0) {

    const toolMap = allTools.reduce(
      (acc, tool) => {
        acc[tool.name] = tool;
        return acc;
      },
      {} as Record<string, any>,
    );

    const toolPromises = result.tool_calls.map(async (toolCall) => {
      sendSSEMessage(state.clientId, {
        type: "tool_executing",
        message: `Executing tool: ${toolCall.name}`,
        toolName: toolCall.name,
      });

      let toolAttempts = 0;
      while (toolAttempts < 2) {
        try {
          const tool = toolMap[toolCall.name];
          if (tool) {
            if (!toolCall.args || Object.keys(toolCall.args).length === 0) {
              console.error(`Tool ${toolCall.name} received empty arguments`);
              throw new Error(`Tool ${toolCall.name} received empty arguments`);
            }

            let toolResult;
            try {
              toolResult = await tool.invoke(toolCall.args);
            } catch (schemaError) {
              console.error(`Schema validation error for ${toolCall.name}:`, schemaError);
              const fixedArgs = fixToolArgs(toolCall.name, toolCall.args);
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
              message: `Tool ${toolCall.name} completed successfully`,
              toolName: toolCall.name,
              result: validatedResult,
            });
            return { toolCall, result: validatedResult };
          } else {
            sendSSEMessage(state.clientId, {
              type: "tool_error",
              message: `Tool ${toolCall.name} not found`,
              toolName: toolCall.name,
              error: `Tool ${toolCall.name} not found`,
            });
            return {
              toolCall,
              error: `Tool ${toolCall.name} not found`,
            };
          }
        } catch (error) {
          toolAttempts++;
          if (toolAttempts >= 2) {
            sendSSEMessage(state.clientId, {
              type: "tool_error",
              message: `Tool ${toolCall.name} failed after retries`,
              toolName: toolCall.name,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              toolCall,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          sendSSEMessage(state.clientId, {
            type: "tool_retry",
            message: `Retrying tool ${toolCall.name} (attempt ${toolAttempts + 1})`,
            toolName: toolCall.name,
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    });

    const results = await Promise.all(toolPromises);
    toolResults.push(...results);
    executedCount = results.filter(r => !r?.error).length;
  } else {
    console.log(`[EXECUTE] No tool calls generated by model`);
    sendSSEMessage(state.clientId, {
      type: "execution_complete",
      message: "No tools were needed for this step",
      executedCount: 0,
      totalTools: 0,
    });
  }

  const executionSummary = executedCount > 0
    ? `Execution Results: ${executedCount} tools executed successfully`
    : `No tools executed - model may have completed the task or encountered an issue`;
  sendSSEMessage(state.clientId, {
    type: "execution_complete",
    message: executionSummary,
    executedCount,
    totalTools: toolResults.length,
  });

  const filesCreated = toolResults
    .filter(r => r?.toolCall?.name === "createFile" && !r.error)
    .map(r => r?.toolCall?.args?.filePath);
  const filesModified = toolResults
    .filter(r => r?.toolCall?.name === "updateFile" && !r.error)
    .map(r => r?.toolCall?.args?.filePath);

  const currentProgress = state.progressTracking || {
    filesCreated: [],
    filesModified: [],
    componentsBuilt: [],
    lastSuccessfulIteration: 0,
    noProgressCount: 0,
    lastErrors: [],
  };

  const madeProgress = executedCount > 0 || filesCreated.length > 0 || filesModified.length > 0;

  return {
    toolResults,
    iterations: state.iterations + 1,
    accumulatedResponses: [executionSummary],
    progressTracking: {
      filesCreated: [...currentProgress.filesCreated, ...filesCreated].filter(Boolean),
      filesModified: [...currentProgress.filesModified, ...filesModified].filter(Boolean),
      componentsBuilt: currentProgress.componentsBuilt,
      lastSuccessfulIteration: madeProgress ? state.iterations + 1 : currentProgress.lastSuccessfulIteration,
      noProgressCount: madeProgress ? 0 : currentProgress.noProgressCount + 1,
      lastErrors: state.buildErrors || [],
    },
  };
}

function shouldEnhance(state: GraphState): string {
  return state.analysis?.needsEnhancement ? "enhance" : "plan";
}

async function maxIterationsReached(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "error",
    message: "Maximum iterations reached without completing the task",
  });
  return {
    error: "Maximum iterations (8) reached without completing the task. The agent was unable to successfully build the application.",
  };
}

function isStuck(state: GraphState): boolean {
  if (!state.progressTracking) return false;

  const progress = state.progressTracking;
  const noProgress = progress.noProgressCount >= 3;
  const sameErrors = state.buildErrors && state.buildErrors.length > 0 &&
    state.iterations > 0 &&
    JSON.stringify(state.buildErrors) === JSON.stringify(progress.lastErrors);

  return noProgress || (sameErrors && state.iterations > progress.lastSuccessfulIteration + 3);
}

function shouldIterate(state: GraphState): string {
  if (state.completed) return END;

  if (state.iterations >= 15) {
    sendSSEMessage(state.clientId, {
      type: "max_iterations_reached",
      message: `Maximum 15 iterations reached (current: ${state.iterations})`,
    });
    return "max_iterations";
  }

  if (isStuck(state)) {
    sendSSEMessage(state.clientId, {
      type: "stuck_detected",
      message: "Agent appears stuck - no progress for multiple iterations",
    });
    return "max_iterations";
  }

  if (state.buildStatus === "success") return "test_build";

  if (state.buildStatus === "errors" && state.buildErrors && state.buildErrors.length > 0) {
    const fixableCount = state.errorAnalysis?.fixableCount || 0;
    
    if (fixableCount > 0 && state.iterations < 10) {
      return "fix_errors";
    }
    
    if (state.iterations >= 10) {
      sendSSEMessage(state.clientId, {
        type: "too_many_errors",
        message: "Unable to fix all errors after 10 iterations, completing with current state",
      });
      return "max_iterations";
    }
  }

  return "execute";
}

function shouldTest(state: GraphState): string {
  return state.buildStatus === "tested" ? "push" : "validate";
}

const checkpointer = new MemorySaver();

export function createMainGraph() {
  const workflow = new StateGraph(GraphAnnotation)
    .addNode("analyze", analyzePrompt)
    .addNode("enhance", enhancePromptNode)
    .addNode("plan", planChanges)
    .addNode("get_context", getProjectContext)
    .addNode("execute", executeTools)
    .addNode("validate", validateBuildNode)
    .addNode("test_build", testBuildNode)
    .addNode("fix_errors", intelligentFixErrorsNode)
    .addNode("push", pushToR2Node)
    .addNode("save", saveContextNode)
    .addNode("run", runAppNode)
    .addNode("max_iterations", maxIterationsReached)
    .addEdge(START, "analyze")
    .addConditionalEdges("analyze", shouldEnhance, {
      enhance: "enhance",
      plan: "plan",
    })
    .addEdge("enhance", "plan")
    .addEdge("plan", "get_context")
    .addEdge("get_context", "execute")
    .addEdge("execute", "validate")
    .addConditionalEdges("validate", shouldIterate, {
      test_build: "test_build",
      execute: "execute",
      fix_errors: "fix_errors",
      max_iterations: "max_iterations",
      [END]: END,
    })
    .addEdge("fix_errors", "validate")
    .addConditionalEdges("test_build", shouldTest, {
      push: "push",
      validate: "validate",
    })
    .addEdge("push", "save")
    .addEdge("save", "run")
    .addEdge("run", END)
    .addEdge("max_iterations", END);

  return workflow.compile({ checkpointer });
}

export function createOptimizedGraph() {
  const workflow = new StateGraph(GraphAnnotation)
    .addNode("smart_analyze_plan", smartAnalyzeAndPlanNode)
    .addNode("get_context", getProjectContext)
    .addNode("execute", executeTools)
    .addNode("validate", validateBuildNode)
    .addNode("test_build", testBuildNode)
    .addNode("fix_errors", intelligentFixErrorsNode)
    .addNode("push", pushToR2Node)
    .addNode("save", saveContextNode)
    .addNode("run", runAppNode)
    .addNode("max_iterations", maxIterationsReached)
    .addEdge(START, "smart_analyze_plan")
    .addEdge("smart_analyze_plan", "get_context")
    .addEdge("get_context", "execute")
    .addEdge("execute", "validate")
    .addConditionalEdges("validate", shouldIterate, {
      test_build: "test_build",
      execute: "execute",
      fix_errors: "fix_errors",
      max_iterations: "max_iterations",
      [END]: END,
    })
    .addEdge("fix_errors", "validate")
    .addConditionalEdges("test_build", shouldTest, {
      push: "push",
      validate: "validate",
    })
    .addEdge("push", "save")
    .addEdge("save", "run")
    .addEdge("run", END)
    .addEdge("max_iterations", END);

  return workflow.compile({ checkpointer });
}

export const mainGraph = createMainGraph();
export const optimizedGraph = createOptimizedGraph();
