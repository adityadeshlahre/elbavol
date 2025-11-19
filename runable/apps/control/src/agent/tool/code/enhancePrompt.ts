import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "@/prompt";
import type { WorkflowState } from "@/agent/graphs/main";
import { sendSSEMessage } from "@/sse";

export const enhancePromptInput = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  // .max(256, "Prompt is too long"),
  contextInfo: z.string().optional(),
});

export const enhancePrompt = tool(
  async (input: z.infer<typeof enhancePromptInput>) => {
    const { prompt, contextInfo } = enhancePromptInput.parse(input);
    try {
      const res = await model.invoke([
        {
          role: "user",
          content:
            SYSTEM_PROMPTS.ENHANCED_PROMPT +
            `\n\n Original Prompt: ${prompt}` +
            (contextInfo ? `\n\n Context Information: ${contextInfo}` : ""),
        },
      ]);

      return {
        success: true,
        enhancedPrompt: res.text,
      };
    } catch (error) {
      console.error("Error in enhancePrompt:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Enhancement failed due to an error.",
        error: errorMessage,
      };
    }
  },
  {
    name: "enhancePrompt",
    description:
      "Enhances the given prompt by making it more detailed and contextually relevant.",
    schema: enhancePromptInput,
  },
);

export async function enhancePromptNode(
  state: WorkflowState,
): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "enhancing",
    message: "Enhancing prompt...",
  });

  const result = await enhancePrompt.invoke({
    prompt: state.prompt,
    contextInfo: JSON.stringify(state.analysis),
  });

  const enhanced = result.success
    ? result.enhancedPrompt || state.prompt
    : state.prompt;

  return { enhancedPrompt: enhanced };
}