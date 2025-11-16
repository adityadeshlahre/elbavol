import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "@/prompt";

const userGivenPromptSchema = z.string().min(1).max(256);

export const checkUserGivenPrompt = tool(
  async (
    input: z.infer<typeof userGivenPromptSchema>,
  ): Promise<{ success: boolean; message: any; error?: string }> => {
    try {
      const res = await model.invoke([
        {
          role: "user",
          content:
            SYSTEM_PROMPTS.SECURITY_PROMPT + `\n\n User Given Prompt: ${input}`,
        },
      ]);

      return {
        success: true,
        message: JSON.parse(res.text),
      };
    } catch (error) {
      console.error("Error in checkUserGivenPrompt:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Validation failed due to an error.",
        error: errorMessage,
      };
    }
  },
  {
    name: "checkUserGivenPrompt",
    description:
      "Checks if the user given prompt is safe and does not contain any malicious content.",
    schema: userGivenPromptSchema,
  },
);
