import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "@/prompt";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/main";

const plannerPromptInput = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  // .max(500, "Prompt is too long"),
  contextInfo: z.string().optional(),
});

export const plannerPromptTool = tool(
  async (input: z.infer<typeof plannerPromptInput>) => {
    const { prompt, contextInfo } = plannerPromptInput.parse(input);
    try {
      const res = await model.invoke([
        {
          role: "user",
          content:
            SYSTEM_PROMPTS.PLANNER_PROMPT +
            `\n\n Original Prompt: ${prompt}` +
            (contextInfo ? `\n\n Context Information: ${contextInfo}` : ""),
        },
      ]);

      return {
        success: true,
        plan: res.text,
      };
    } catch (error) {
      console.error("Error in plannerPromptTool:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Planning failed due to an error.",
        error: errorMessage,
      };
    }
  },
  {
    name: "plannerPromptTool",
    description:
      "Generates a detailed plan based on the given prompt and context information.",
    schema: plannerPromptInput,
  },
);


export async function planerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "planning",
    message: "Creating detailed execution plan with tool calls...",
  });

  const promptToUse = state.enhancedPrompt || state.prompt;
  const analysisInfo = state.analysis ? `\n\nAnalysis: Intent=${state.analysis.intent}, Complexity=${state.analysis.complexity}` : '';

  const result = await plannerPromptTool.invoke({
    prompt: promptToUse + analysisInfo,
    contextInfo: JSON.stringify({
      context: state.context,
      analysis: state.analysis,
    }),
  });

  if (!result.success) {
    sendSSEMessage(state.clientId, {
      type: "planning_failed",
      message: "Failed to create plan",
      error: result.error,
    });
    return {
      error: result.error || "Planning failed",
    };
  }

  const toolCalls = generateToolCallsFromPlan(result.plan || "");

  sendSSEMessage(state.clientId, {
    type: "planning_complete",
    message: `Plan created with ${toolCalls.length} tool calls`,
  });

  return {
    plan: result.plan,
    toolCalls: toolCalls,
  };
}

function generateToolCallsFromPlan(_plan: string): any[] {
  const toolCalls: any[] = [];

  toolCalls.push({ tool: "listDir", args: { directory: "." } });
  toolCalls.push({ tool: "listDir", args: { directory: "src" } });
  toolCalls.push({ tool: "listDir", args: { directory: "src/components" } });
  toolCalls.push({ tool: "listDir", args: { directory: "src/components/" } });
  toolCalls.push({ tool: "listDir", args: { directory: "src/components/ui" } });
  toolCalls.push({ tool: "readFile", args: { filePath: "package.json" } });
  toolCalls.push({ tool: "readFile", args: { filePath: "src/App.jsx" } });
  toolCalls.push({ tool: "readFile", args: { filePath: "src/index.css" } });

  return toolCalls;
}