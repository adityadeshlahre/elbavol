import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "@/prompt";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/workflow";

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

export async function userGivenPromptCheckerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "checking_prompt",
    message: "Checking prompt for safety and security...",
  });

  const result = await checkUserGivenPrompt.invoke(state.prompt);

  if (!result.success) {
    sendSSEMessage(state.clientId, {
      type: "prompt_check_failed",
      message: "Prompt validation failed",
      error: result.error,
    });
    return {
      error: result.error || "Prompt validation failed",
    };
  }

  const validation = result.message;

  if (!validation.isSafe) {
    sendSSEMessage(state.clientId, {
      type: "prompt_unsafe",
      message: "Prompt contains unsafe or malicious content",
      reason: validation.reason,
    });
    return {
      error: `Unsafe prompt: ${validation.reason}`,
    };
  }

  sendSSEMessage(state.clientId, {
    type: "prompt_check_passed",
    message: "Prompt validation passed successfully",
  });

  return {};
}