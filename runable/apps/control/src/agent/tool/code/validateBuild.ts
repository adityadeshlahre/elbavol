import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { SYSTEM_PROMPTS } from "./../../../prompt/systemPrompt";

const validateBuildInput = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  userInstructions: z.string().min(1, "User instructions are required"),
});

export const validateBuild = tool(
  async (input: z.infer<typeof validateBuildInput>) => {
    const { projectId, userInstructions } = validateBuildInput.parse(input);
    try {
      const res = await model.invoke([
        {
          role: "user",
          content:
            SYSTEM_PROMPTS.BUILDER_PROMPT.trim() +
            `\n\n Project ID: ${projectId} \n\n User Instructions: ${userInstructions}`,
        },
      ]);

      return {
        success: true,
        message: JSON.parse(res.text),
        projectId,
        userInstructions,
      };
    } catch (error) {
      console.error("Error in pushFilesToR2:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Validation failed due to an error.",
        projectId,
        userInstructions,
        error: errorMessage,
      };
    }
  },
  {
    name: "validateBuild",
    description:
      "Validates if the build meets all the specified requirements and standards.",
    schema: validateBuildInput,
  },
);
