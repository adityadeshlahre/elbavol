import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "@/prompt/systemPrompt";

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
