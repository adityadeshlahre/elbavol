import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { GraphState } from "@/agent/graphs/main";

const smartAnalyzerInput = z.object({
    prompt: z.string().min(1, "Prompt is required"),
    projectId: z.string().min(1, "Project ID is required"),
    context: z.any().optional(),
});

export const smartAnalyzeAndPlan = tool(
    async (input: z.infer<typeof smartAnalyzerInput>) => {
        const { prompt, context } = smartAnalyzerInput.parse(input);

        const systemPrompt = `You are an expert AI assistant that analyzes user prompts and creates detailed execution plans for building React applications.

Your task is to:
1. Analyze the prompt intent and complexity
2. Enhance the prompt if it's vague or needs clarification
3. Create a detailed, step-by-step execution plan

Return a JSON object with this structure:
{
  "analysis": {
    "intent": "creation|modification|debugging|validation|general",
    "complexity": "low|medium|high",
    "needsEnhancement": boolean,
    "requiredTools": ["tool1", "tool2"],
    "estimatedSteps": number
  },
  "enhancedPrompt": "enhanced version of the prompt (if needed)",
  "plan": "detailed step-by-step plan with specific actions"
}

CRITICAL: Return ONLY valid JSON, no markdown, no code blocks, just the JSON object.`;

        try {
            const response = await model.invoke([
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: `Analyze and plan: ${prompt}\n\nContext: ${JSON.stringify(context || {})}`,
                },
            ]);

            let result;
            try {
                const text = response.text.trim();

                // Try to extract JSON from markdown code blocks first
                let jsonText = text;
                const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    jsonText = codeBlockMatch[1];
                } else {
                    // Try to find JSON object in the response
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                    }
                }

                // Clean up common JSON issues
                jsonText = jsonText
                    .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
                    .replace(/\r\n/g, '\\n')        // Escape newlines in strings
                    .replace(/\n/g, '\\n')          // Escape newlines in strings
                    .replace(/\r/g, '')             // Remove carriage returns
                    .trim();

                result = JSON.parse(jsonText);

                // Validate result has required fields
                if (!result.analysis || !result.plan) {
                    throw new Error("Missing required fields in response");
                }

            } catch (parseError) {
                console.error("Failed to parse AI response:", parseError);
                console.error("AI response text:", response.text.substring(0, 500));

                // Fallback: Create a basic plan
                result = {
                    analysis: {
                        intent: "general",
                        complexity: "medium",
                        needsEnhancement: false,
                        requiredTools: ["createFile", "readFile", "updateFile"],
                        estimatedSteps: 5
                    },
                    enhancedPrompt: prompt,
                    plan: `Based on the prompt: "${prompt}", create a React application with the following steps:
1. Read existing project structure
2. Create necessary components
3. Update routing if needed
4. Add required dependencies
5. Test the build`
                };
            }

            return {
                success: true,
                analysis: result.analysis,
                enhancedPrompt: result.enhancedPrompt || prompt,
                plan: result.plan,
            };
        } catch (error) {
            console.error("Error in smartAnalyzeAndPlan:", error);
            return {
                success: false,
                message: "Failed to analyze and plan",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    {
        name: "smartAnalyzeAndPlan",
        description: "Analyzes user prompt and creates a detailed execution plan in a single efficient step.",
        schema: smartAnalyzerInput,
    },
);

export async function smartAnalyzeAndPlanNode(state: GraphState): Promise<Partial<GraphState>> {
    sendSSEMessage(state.clientId, {
        type: "analyzing_and_planning",
        message: "Analyzing prompt and creating execution plan...",
    });

    const result = await smartAnalyzeAndPlan.invoke({
        prompt: state.prompt,
        projectId: state.projectId,
        context: state.context,
    });

    if (!result.success) {
        sendSSEMessage(state.clientId, {
            type: "analysis_error",
            message: "Failed to analyze and plan",
            error: result.error,
        });

        return {
            error: result.error || "Failed to analyze and plan",
            analysis: { intent: "general", complexity: "medium", needsEnhancement: false },
            enhancedPrompt: state.prompt,
            generatedPlan: "Create the requested application using available tools.",
        };
    }

    sendSSEMessage(state.clientId, {
        type: "planning_complete",
        message: `Plan created: ${result.analysis.estimatedSteps || 'multiple'} steps`,
        analysis: result.analysis,
    });

    return {
        analysis: result.analysis,
        enhancedPrompt: result.enhancedPrompt,
        generatedPlan: result.plan,
        accumulatedResponses: [`Analysis: ${result.analysis.intent} (${result.analysis.complexity} complexity)`, `Plan: ${result.plan}`],
    };
}
