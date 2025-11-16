import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { sendSSEMessage } from "../../sse";
import { promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { buildSource } from "../tool/code/buildSource";
import { enhancePrompt } from "../tool/code/enhancePrompt";
import { plannerPromptTool } from "../tool/code/plannerPrompt";
import { validateBuild } from "../tool/code/validateBuild";
import { getContext } from "../tool/dry/getContext";
import { saveContext } from "../tool/dry/saveContext";
import { testBuild } from "../tool/dry/testBuild";
import { toolExecutor } from "../tool/executor/toolexe";
import { pushFilesToR2 } from "../tool/r2/push";

export const GraphAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  prompt: Annotation<string>(),
  analysis: Annotation<any>(),
  enhancedPrompt: Annotation<string>(),
  generatedPlan: Annotation<string>(),
  context: Annotation<any>(),
  toolResults: Annotation<any[]>(),
  buildStatus: Annotation<string>(),
  iterations: Annotation<number>({ reducer: (a, b) => b, default: () => 0 }),
  completed: Annotation<boolean>({
    reducer: (a, b) => b,
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

type GraphState = typeof GraphAnnotation.State;

async function analyzePrompt(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "analyzing",
    message: "Analyzing prompt...",
  });
  const result = await promptAnalyzer.invoke({
    prompt: state.prompt,
    projectId: state.projectId,
  });
  return { analysis: result.analysis };
}

async function enhancePromptNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  let enhanced = state.prompt;
  if (state.analysis?.needsEnhancement) {
    sendSSEMessage(state.clientId, {
      type: "enhancing",
      message: "Enhancing prompt...",
    });
    const result = await enhancePrompt.invoke({
      prompt: state.prompt,
      contextInfo: JSON.stringify(state.analysis),
    });
    enhanced = result.success
      ? result.enhancedPrompt || state.prompt
      : state.prompt;
    if (result.success && result.enhancedPrompt) {
      return {
        enhancedPrompt: enhanced,
        accumulatedResponses: [`Enhanced Prompt: ${result.enhancedPrompt}`],
      };
    }
  }
  return { enhancedPrompt: enhanced };
}

async function planChanges(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "planning",
    message: "Planning changes...",
  });
  const result = await plannerPromptTool.invoke({
    prompt: state.enhancedPrompt,
    contextInfo: JSON.stringify(state.context),
  });
  const plan = result.success ? result.plan : "Default plan";
  return {
    generatedPlan: plan,
    accumulatedResponses: result.success ? [`Planning: ${result.plan}`] : [],
  };
}

async function getProjectContext(
  state: GraphState,
): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "context",
    message: "Getting project context...",
  });
  const result = await getContext.invoke({ projectId: state.projectId });
  const context = result.context;
  return { context };
}

async function executeTools(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "executing",
    message: "Executing tools...",
  });

  const { model } = await import("../../agent/client");
  const { SYSTEM_PROMPTS } = await import("../../prompt");
  const tools = await import("../tool/index");

  const modelWithTools = model.bindTools(Object.values(tools));

  const result = await modelWithTools.invoke([
    {
      role: "system",
      content: SYSTEM_PROMPTS.BUILDER_PROMPT,
    },
    {
      role: "user",
      content: `Execute this plan: ${state.generatedPlan}\n\nContext: ${JSON.stringify(state.context)}`,
    },
  ]);

  const toolResults = [];
  let executedCount = 0;

  if (result.tool_calls) {
    const toolMap = Object.values(tools).reduce(
      (acc, tool) => {
        acc[tool.name] = tool;
        return acc;
      },
      {} as Record<string, any>,
    );

    for (const toolCall of result.tool_calls) {
      try {
        const tool = toolMap[toolCall.name];
        if (tool) {
          const toolResult = await tool.invoke(toolCall.args);
          toolResults.push({ toolCall, result: toolResult });
          executedCount++;
        } else {
          toolResults.push({
            toolCall,
            error: `Tool ${toolCall.name} not found`,
          });
        }
      } catch (error) {
        toolResults.push({
          toolCall,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const executionSummary = `Execution Results: ${executedCount} tools executed successfully`;
  return {
    toolResults,
    iterations: state.iterations + 1,
    accumulatedResponses: [executionSummary],
  };
}

async function validateBuildNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "validating",
    message: "Validating build...",
  });
  const result = await validateBuild.invoke({
    projectId: state.projectId,
    userInstructions: state.prompt,
  });
  const status = result.success ? "success" : "failed";
  return { buildStatus: status };
}

async function testBuildNode(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "testing",
    message: "Testing build...",
  });
  const result = await testBuild.invoke({
    action: "build",
    cwd: state.projectId,
  });
  return {
    buildStatus: result.success ? "tested" : "errors",
    error: result.stderr || result.error,
  };
}

async function fixErrorsNode(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "fixing",
    message: "Fixing errors...",
  });
  // Get updated context before fixing
  const contextResult = await getContext.invoke({ projectId: state.projectId });
  const updatedContext = contextResult.context;

  const result = await toolExecutor.invoke({
    projectId: state.projectId,
    toolName: "fixErrors",
    toolInput: { error: state.error, context: updatedContext },
  });
  return { context: updatedContext, toolResults: [result] };
}

async function pushToR2Node(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "pushing",
    message: "Pushing to storage...",
  });
  const result = await pushFilesToR2.invoke({
    projectId: state.projectId,
    bucketName: "elbavol",
  });
  return { pushResult: result };
}

async function saveContextNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "saving",
    message: "Saving context...",
  });
  await saveContext.invoke({
    context: state.context,
    filePath: `${state.projectId}/context.json`,
  });
  return { completed: true };
}

async function runAppNode(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "running",
    message: "Running application...",
  });
  await buildSource.invoke({ projectId: state.projectId });

  const { producer } = await import("../../index");
  const { MESSAGE_KEYS, TOPIC } = await import("@elbavol/constants");

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

  return {};
}

function shouldEnhance(state: GraphState): string {
  return state.analysis?.needsEnhancement ? "enhance" : "plan";
}

function shouldIterate(state: GraphState): string {
  if (state.completed) return END;
  if (state.iterations >= 8) return END;
  if (state.buildStatus === "success") return "test_build";
  return "execute";
}

function shouldTest(state: GraphState): string {
  return state.buildStatus === "tested" ? "push" : "fix_errors";
}

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
      [END]: END,
    })
    .addConditionalEdges("test_build", shouldTest, {
      push: "push",
      fix_errors: "fix_errors",
    })
    .addEdge("fix_errors", "test_build")
    .addEdge("push", "save")
    .addEdge("save", "run")
    .addEdge("run", END);

  return workflow.compile();
}

export const mainGraph = createMainGraph();
