import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { GraphState } from "@/agent/graphs/main";

const errorFixerInput = z.object({
  projectId: z.string(),
  errors: z.array(z.any()),
  errorAnalysis: z.any(),
  context: z.any().optional(),
  previousAttempts: z.array(z.string()).optional(),
});

function createFallbackFixPlan(errors: any[], _errorAnalysis: any): any[] {
  const fixPlan: any[] = [];

  const dependencyErrors = errors.filter(e =>
    e.type === 'dependency' ||
    e.message?.includes('Cannot find module') ||
    e.message?.includes('not found')
  );

  if (dependencyErrors.length > 0) {
    const missingPackages = dependencyErrors
      .map(e => {
        const match = e.message?.match(/['"]([^'"]+)['"]/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (missingPackages.length > 0) {
      fixPlan.push({
        priority: 1,
        action: "addDependency",
        target: missingPackages.join(", "),
        description: "Install missing dependencies",
        details: { packages: missingPackages }
      });
    }
  }

  const importErrors = errors.filter(e => e.type === 'import');
  if (importErrors.length > 0) {
    const uiComponentErrors = importErrors.filter(e =>
      e.message?.includes('@/components/ui/') ||
      e.message?.includes('components/ui/')
    );

    if (uiComponentErrors.length > 0) {
      const componentsToAdd = new Set<string>();
      for (const error of uiComponentErrors) {
        const match = error.message?.match(/['"]([^'"]*components\/ui\/([^'"]+))['"]/) ||
          error.message?.match(/@\/components\/ui\/([^'"\s]+)/);
        if (match) {
          const componentName = match[2] || match[1];
          if (componentName) {
            componentsToAdd.add(componentName);
          }
        }
      }

      if (componentsToAdd.size > 0) {
        fixPlan.push({
          priority: 1,
          action: "executeCommand",
          target: Array.from(componentsToAdd).join(", "),
          description: `Add missing shadcn/ui components: ${Array.from(componentsToAdd).join(", ")}`,
          details: {
            command: `bunx --bun shadcn@latest add ${Array.from(componentsToAdd).join(" ")}`
          }
        });
      }
    }
  } else {
    fixPlan.push({
      priority: 2,
      action: "executeCommand",
      target: "src/",
      description: "Run build to regenerate imports",
      details: { command: "bun run build" }
    });
  }

  return fixPlan;
}

export const intelligentErrorFixer = tool(
  async (input: z.infer<typeof errorFixerInput>) => {
    const { errors, errorAnalysis, context, previousAttempts } = errorFixerInput.parse(input);

    const errorSummary = `
Build Errors Analysis:
- Total Errors: ${errorAnalysis?.totalErrors || errors.length}
- Critical: ${errorAnalysis?.criticalCount || 0}
- Major: ${errorAnalysis?.majorCount || 0}
- Minor: ${errorAnalysis?.minorCount || 0}
- Fixable: ${errorAnalysis?.fixableCount || 0}

Error Types:
${Object.entries(errorAnalysis?.errorsByType || {})
        .filter(([_, count]) => (count as number) > 0)
        .map(([type, count]) => `- ${type}: ${count}`)
        .join('\n')}

Detailed Errors:
${errors.slice(0, 10).map((err, idx) => `${idx + 1}. [${err.severity}] ${err.type}: ${err.message}${err.file ? ` (${err.file}${err.line ? `:${err.line}` : ''})` : ''}`).join('\n')}

${previousAttempts && previousAttempts.length > 0 ? `
Previous Fix Attempts (that failed):
${previousAttempts.map((attempt, idx) => `${idx + 1}. ${attempt}`).join('\n')}
` : ''}

Context:
${JSON.stringify(context, null, 2)}
`;

    const systemPrompt = `You are an expert JavaScript/React error fixer. Analyze the build errors and create a detailed fix plan.

For each error type, provide specific tool calls to fix them:
1. Import errors → use updateFile or createFile to add imports
2. Syntax errors → use updateFile to fix syntax
3. Missing files → use createFile to create missing files
4. Dependency errors → use addDependency to add missing packages

Return a JSON array of fix actions in this format:
[
  {
    "priority": 1,
    "action": "updateFile" | "createFile" | "addDependency" | "executeCommand",
    "target": "file path or package name",
    "description": "what this fix does",
    "details": {
      // action-specific details
    }
  }
]

CRITICAL: Return ONLY valid JSON array, no markdown, no explanations, just the JSON array.`;

    try {
      const response = await model.invoke([
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: errorSummary,
        },
      ]);

      let fixPlan;
      try {
        const text = response.text.trim();

        // Try to extract JSON from markdown code blocks first
        let jsonText = text;
        const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonText = codeBlockMatch[1];
        } else {
          // Try to find JSON array in the response
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
        }

        // Clean up common JSON issues
        jsonText = jsonText
          .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
          .replace(/\n/g, ' ')            // Remove newlines within strings
          .replace(/\r/g, '')             // Remove carriage returns
          .trim();

        fixPlan = JSON.parse(jsonText);

        // Validate fixPlan is an array
        if (!Array.isArray(fixPlan)) {
          throw new Error("Fix plan is not an array");
        }

      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.error("AI response text:", response.text);

        // Fallback: Create a simple fix plan based on error types
        console.log("Creating fallback fix plan...");
        fixPlan = createFallbackFixPlan(errors, errorAnalysis);

        if (fixPlan.length === 0) {
          return {
            success: false,
            message: "Failed to generate fix plan",
            error: "AI response was not valid JSON and no fallback available",
          };
        }
      }

      return {
        success: true,
        fixPlan,
        errorsSummary: errorSummary,
      };
    } catch (error) {
      console.error("Error in intelligentErrorFixer:", error);
      return {
        success: false,
        message: "Failed to analyze errors",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    name: "intelligentErrorFixer",
    description: "Analyzes build errors and creates an AI-powered fix plan with specific actions to resolve them.",
    schema: errorFixerInput,
  },
);

export async function intelligentFixErrorsNode(state: GraphState): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "fixing",
    message: "Analyzing errors with AI...",
  });

  if (!state.buildErrors || state.buildErrors.length === 0) {
    sendSSEMessage(state.clientId, {
      type: "fixing",
      message: "No build errors to fix",
    });
    return { buildStatus: "success" };
  }

  const previousAttempts = state.toolResults
    ?.filter((r: any) => r?.error)
    .map((r: any) => `${r.toolCall?.name}: ${r.error}`)
    .slice(-5) || [];

  const fixPlanResult = await intelligentErrorFixer.invoke({
    projectId: state.projectId,
    errors: state.buildErrors,
    errorAnalysis: state.errorAnalysis,
    context: state.context,
    previousAttempts,
  });

  if (!fixPlanResult.success || !fixPlanResult.fixPlan) {
    sendSSEMessage(state.clientId, {
      type: "fixing_error",
      message: "Failed to generate fix plan",
    });
    return {
      error: fixPlanResult.error || "Failed to generate fix plan",
    };
  }

  sendSSEMessage(state.clientId, {
    type: "fixing_plan",
    message: `Generated fix plan with ${fixPlanResult.fixPlan.length} actions`,
    fixPlan: fixPlanResult.fixPlan,
  });

  const { allTools } = await import("./../../graphs/main");
  const toolMap = allTools.reduce(
    (acc: Record<string, any>, tool: any) => {
      acc[tool.name] = tool;
      return acc;
    },
    {},
  );

  const fixResults = [];
  for (const action of fixPlanResult.fixPlan.slice(0, 10)) {
    try {
      sendSSEMessage(state.clientId, {
        type: "executing_fix",
        message: `Executing: ${action.description}`,
        action,
      });

      const tool = toolMap[action.action];
      if (!tool) {
        console.warn(`Tool ${action.action} not found for fix action`);
        continue;
      }

      const result = await tool.invoke(action.details);
      fixResults.push({ action, result, success: result.success !== false });

      sendSSEMessage(state.clientId, {
        type: "fix_completed",
        message: `Completed: ${action.description}`,
        success: result.success !== false,
      });
    } catch (error) {
      console.error(`Error executing fix action ${action.action}:`, error);
      fixResults.push({
        action,
        error: error instanceof Error ? error.message : String(error),
        success: false,
      });
    }
  }

  const successCount = fixResults.filter(r => r.success).length;
  sendSSEMessage(state.clientId, {
    type: "fixing_complete",
    message: `Applied ${successCount}/${fixResults.length} fixes`,
    fixResults,
  });

  return {
    toolResults: fixResults,
    accumulatedResponses: [`Applied ${successCount}/${fixResults.length} error fixes`],
  };
}
