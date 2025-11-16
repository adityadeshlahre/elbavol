import { Annotation, END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { sendSSEMessage } from "../../sse";
import { analyzePrompt, promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { buildSource, runAppNode } from "../tool/code/buildSource";
import { enhancePrompt, enhancePromptNode } from "../tool/code/enhancePrompt";
import { planChanges, plannerPromptTool } from "../tool/code/plannerPrompt";
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
import { fixToolArgs } from "../index";

const allTools = [
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
          content: `Execute this plan: ${state.generatedPlan}\n\nContext: ${JSON.stringify(state.context)}\n\nIMPORTANT: You MUST use the available tools to execute this plan. Do NOT respond with text - use the tools to create files, read files, and perform all operations. Start by using listDir to check the current project structure.`,
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

  return {
    toolResults,
    iterations: state.iterations + 1,
    accumulatedResponses: [executionSummary],
  };
}

async function fixErrorsNode(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "fixing",
    message: "Fixing errors...",
  });

  const contextResult = await getContext.invoke({ projectId: state.projectId });
  const updatedContext = contextResult.context;

  const strategies = [
    { toolName: "readFile", toolInput: { filePath: "package.json" } },
    { toolName: "executeCommand", toolInput: { command: "bun install", cwd: state.projectId } },
    { toolName: "testBuild", toolInput: { action: "build", cwd: state.projectId } },
  ];

  const toolMap = allTools.reduce(
    (acc, tool) => {
      acc[tool.name] = tool;
      return acc;
    },
    {} as Record<string, any>,
  );

  const results = [];
  for (const strategy of strategies) {
    try {
      sendSSEMessage(state.clientId, {
        type: "fixing",
        message: `Trying strategy: ${strategy.toolName}`,
      });

      const tool = toolMap[strategy.toolName];
      if (!tool) {
        throw new Error(`Tool ${strategy.toolName} not found`);
      }

      const result = await tool.invoke(strategy.toolInput);
      const success = result.success !== false;

      results.push({ success, result, toolName: strategy.toolName });

      if (success) {
        sendSSEMessage(state.clientId, {
          type: "fixing",
          message: `Strategy ${strategy.toolName} succeeded`,
        });
        break;
      }
    } catch (error) {
      console.warn(`Strategy ${strategy.toolName} failed:`, error);
      results.push({ success: false, error: String(error), toolName: strategy.toolName });
    }
  }

  return { context: updatedContext, toolResults: results };
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

function shouldIterate(state: GraphState): string {
  if (state.completed) return END;
  if (state.iterations >= 8) return "max_iterations";
  if (state.buildStatus === "success") return "test_build";
  return "execute";
}

function shouldTest(state: GraphState): string {
  return state.buildStatus === "tested" ? "push" : "fix_errors";
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
    .addNode("fix_errors", fixErrorsNode)
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
      max_iterations: "max_iterations",
      [END]: END,
    })
    .addConditionalEdges("test_build", shouldTest, {
      push: "push",
      fix_errors: "fix_errors",
    })
    .addEdge("fix_errors", "test_build")
    .addEdge("push", "save")
    .addEdge("save", "run")
    .addEdge("run", END)
    .addEdge("max_iterations", END);

  return workflow.compile({ checkpointer });
}

export const mainGraph = createMainGraph();
