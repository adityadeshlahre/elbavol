import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { enhancePrompt } from "../tool/code/enhancePrompt";
import { plannerPromptTool } from "../tool/code/plannerPrompt";
import { getContext } from "../tool/dry/getContext";
import { toolExecutor } from "../workflow/tools";
import { validateBuild } from "../tool/code/validateBuild";
import { saveContext } from "../tool/dry/saveContext";
import { buildSource } from "../tool/code/buildSource";
import { testBuild } from "../tool/dry/testBuild";
import { pushFilesToR2 } from "../tool/r2PullPush/push";

export const GraphAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  prompt: Annotation<string>(),
  analysis: Annotation<any>(),
  enhancedPrompt: Annotation<string>(),
  plan: Annotation<string>(),
  context: Annotation<any>(),
  toolResults: Annotation<any[]>(),
  buildStatus: Annotation<string>(),
  iterations: Annotation<number>({ reducer: (a, b) => b, default: () => 0 }),
  completed: Annotation<boolean>({ reducer: (a, b) => b, default: () => false }),
  error: Annotation<string>(),
  pushResult: Annotation<any>(),
});

type GraphState = typeof GraphAnnotation.State;

async function analyzePrompt(state: GraphState): Promise<Partial<GraphState>> {
  const result = await promptAnalyzer.invoke({ prompt: state.prompt, projectId: state.projectId });
  return { analysis: result.analysis };
}

async function enhancePromptNode(state: GraphState): Promise<Partial<GraphState>> {
  let enhanced = state.prompt;
  if (state.analysis?.needsEnhancement) {
    const result = await enhancePrompt.invoke({ prompt: state.prompt, contextInfo: JSON.stringify(state.analysis) });
    enhanced = result.success ? (result.enhancedPrompt || state.prompt) : state.prompt;
  }
  return { enhancedPrompt: enhanced };
}

async function planChanges(state: GraphState): Promise<Partial<GraphState>> {
  const result = await plannerPromptTool.invoke({ prompt: state.enhancedPrompt, contextInfo: JSON.stringify(state.context) });
  const plan = result.success ? result.plan : "Default plan";
  return { plan };
}

async function getProjectContext(state: GraphState): Promise<Partial<GraphState>> {
  const result = await getContext.invoke({ projectId: state.projectId });
  const context = result.context;
  return { context };
}

async function executeTools(state: GraphState): Promise<Partial<GraphState>> {
  const result = await toolExecutor.invoke({
    projectId: state.projectId,
    toolName: "executePlan",
    toolInput: { plan: state.plan, context: state.context }
  });
  const { stateManager } = await import("../state/manager");
  stateManager.incrementIteration(state.projectId);
  return { toolResults: [result], iterations: state.iterations + 1 };
}

async function validateBuildNode(state: GraphState): Promise<Partial<GraphState>> {
  const result = await validateBuild.invoke({ projectId: state.projectId, userInstructions: state.prompt });
  const status = result.success ? "success" : "failed";
  return { buildStatus: status };
}

async function testBuildNode(state: GraphState): Promise<Partial<GraphState>> {
  const result = await testBuild.invoke({ action: "build", cwd: state.projectId });
  return { buildStatus: result.success ? "tested" : "errors", error: result.stderr || result.error };
}

async function fixErrorsNode(state: GraphState): Promise<Partial<GraphState>> {
  // Get updated context before fixing
  const contextResult = await getContext.invoke({ projectId: state.projectId });
  const updatedContext = contextResult.context;

  const result = await toolExecutor.invoke({
    projectId: state.projectId,
    toolName: "fixErrors",
    toolInput: { error: state.error, context: updatedContext }
  });
  return { context: updatedContext, toolResults: [result] };
}

async function pushToR2Node(state: GraphState): Promise<Partial<GraphState>> {
  const result = await pushFilesToR2.invoke({ projectId: state.projectId, bucketName: "elbavol" });
  return { pushResult: result };
}

async function saveContextNode(state: GraphState): Promise<Partial<GraphState>> {
  await saveContext.invoke({ context: state.context, filePath: `${state.projectId}/context.json` });
  const { stateManager } = await import("../state/manager");
  stateManager.setStatus(state.projectId, "completed");
  return { completed: true };
}

async function runAppNode(state: GraphState): Promise<Partial<GraphState>> {
  await buildSource.invoke({ projectId: state.projectId });
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