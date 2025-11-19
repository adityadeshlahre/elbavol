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

  const contextInfo = JSON.stringify({
    context: state.context,
    analysis: state.analysis,
    existingFiles: state.context?.currentFiles || {},
  });

  const result = await plannerPromptTool.invoke({
    prompt: promptToUse + analysisInfo,
    contextInfo: contextInfo,
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

  let parsedPlan;
  let toolCalls;

  try {
    const text = (result.plan || "").trim();

    let jsonText = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonText = codeBlockMatch[1];
    } else {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
    }

    jsonText = jsonText
      .replace(/,(\s*[\]}])/g, '$1')
      .replace(/\r/g, '')
      .trim();

    parsedPlan = JSON.parse(jsonText);
    toolCalls = parsedPlan.toolCalls || [];

    if (toolCalls.length === 0) {
      throw new Error("No tool calls generated in plan");
    }

  } catch (parseError) {
    console.error("Failed to parse plan JSON:", parseError);
    console.error("Plan text:", (result.plan || "").substring(0, 500));

    sendSSEMessage(state.clientId, {
      type: "planning_retry",
      message: "Invalid plan format, retrying with stricter instructions...",
    });

    const retryResult = await plannerPromptTool.invoke({
      prompt: `${promptToUse + analysisInfo}\n\nIMPORTANT: You MUST return ONLY a valid JSON object with this exact structure:\n{\n  "plan": "description",\n  "toolCalls": [{"tool": "toolName", "args": {...}}]\n}\nDo NOT use markdown code blocks. Do NOT add any text outside the JSON. Return ONLY the JSON object.`,
      contextInfo: contextInfo,
    });

    if (!retryResult.success) {
      return {
        error: "Failed to generate valid plan after retry",
      };
    }

    try {
      const retryText = (retryResult.plan || "").trim();
      let retryJsonText = retryText;

      const retryCodeBlockMatch = retryText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (retryCodeBlockMatch && retryCodeBlockMatch[1]) {
        retryJsonText = retryCodeBlockMatch[1];
      } else {
        const retryJsonMatch = retryText.match(/\{[\s\S]*\}/);
        if (retryJsonMatch) {
          retryJsonText = retryJsonMatch[0];
        }
      }

      retryJsonText = retryJsonText
        .replace(/,(\s*[\]}])/g, '$1')
        .replace(/\r/g, '')
        .trim();

      parsedPlan = JSON.parse(retryJsonText);
      toolCalls = parsedPlan.toolCalls || [];

      if (toolCalls.length === 0) {
        throw new Error("No tool calls in retry");
      }
    } catch (retryError) {
      console.error("Retry also failed:", retryError);
      return {
        error: "Unable to generate valid execution plan with tool calls",
      };
    }
  }

  sendSSEMessage(state.clientId, {
    type: "planning_complete",
    message: `Plan created with ${toolCalls.length} tool calls`,
  });

  return {
    plan: parsedPlan.plan || result.plan,
    toolCalls: toolCalls,
  };
}
