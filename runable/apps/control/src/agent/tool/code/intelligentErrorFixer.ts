import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/workflow";

const errorFixerInput = z.object({
  projectId: z.string(),
  errors: z.array(z.any()),
  errorAnalysis: z.any(),
  context: z.any().optional(),
  previousAttempts: z.array(z.string()).optional(),
});

function createFallbackFixPlan(errors: any[], _errorAnalysis: any, fullBuildError?: string): any[] {
  const fixPlan: any[] = [];

  const allMissingPackages = new Set<string>();

  if (fullBuildError) {
    const vitePattern = /failed to resolve import ["']([^"']+)["']/gi;
    let match;
    while ((match = vitePattern.exec(fullBuildError)) !== null) {
      if (match[1]) allMissingPackages.add(match[1]);
    }

    const modulePattern = /Cannot find module ["']([^"']+)["']/gi;
    while ((match = modulePattern.exec(fullBuildError)) !== null) {
      if (match[1]) allMissingPackages.add(match[1]);
    }
  }

  const buildErrorPattern = /failed to resolve import ["']([^"']+)["']/i;
  const moduleNotFoundPattern = /Cannot find module ["']([^"']+)["']/i;

  for (const error of errors) {
    const errorMsg = error.message || error.error || String(error);
    let match = errorMsg.match(buildErrorPattern);
    if (match && match[1]) {
      allMissingPackages.add(match[1]);
    }
    match = errorMsg.match(moduleNotFoundPattern);
    if (match && match[1]) {
      allMissingPackages.add(match[1]);
    }
    if (error.type === 'dependency' || errorMsg.includes('not found')) {
      match = errorMsg.match(/['"]([^'"]+)['"]/);
      if (match && match[1]) {
        allMissingPackages.add(match[1]);
      }
    }
  } if (allMissingPackages.size > 0) {
    const packages = Array.from(allMissingPackages);
    fixPlan.push({
      priority: 1,
      action: "addDependency",
      target: packages.join(", "),
      description: `Install missing dependencies: ${packages.join(", ")}`,
      details: { packages }
    });
  }

  const exportErrorPattern = /"([^"]+)" is not exported by "([^"]+)"/i;
  for (const error of errors) {
    const errorMsg = error.message || error.error || String(error);
    const match = errorMsg.match(exportErrorPattern);
    if (match && match[1] && match[2]) {
      const wrongExport = match[1];
      const packageName = match[2];

      if (packageName.includes('lucide-react')) {
        let correctExport = wrongExport;
        if (wrongExport === 'Tools') correctExport = 'Tool';
        if (wrongExport === 'Settings') correctExport = 'Settings';
        if (wrongExport === 'Icons') correctExport = 'Icon';

        if (correctExport !== wrongExport && fullBuildError) {
          const importPattern = new RegExp(`import\\s*{([^}]*\\b${wrongExport}\\b[^}]*)}\\s*from\\s*['"]${packageName.replace(/\//g, '\\/')}['"]`, 'i');
          const importMatch = fullBuildError.match(importPattern);

          if (importMatch) {
            const oldImport = importMatch[0];
            const newImport = oldImport.replace(wrongExport, correctExport);

            fixPlan.push({
              priority: 1,
              action: "replaceInFile",
              target: `Fix ${wrongExport} -> ${correctExport}`,
              description: `Fix invalid export: ${wrongExport} should be ${correctExport} in ${packageName}`,
              details: {
                filePath: error.file || "src/components/ServicesSection.jsx",
                oldString: oldImport,
                newString: newImport
              }
            });

            fixPlan.push({
              priority: 2,
              action: "replaceInFile",
              target: `Fix JSX usage of ${wrongExport}`,
              description: `Update JSX to use ${correctExport} instead of ${wrongExport}`,
              details: {
                filePath: error.file || "src/components/ServicesSection.jsx",
                oldString: `<${wrongExport}`,
                newString: `<${correctExport}`
              }
            });

            fixPlan.push({
              priority: 3,
              action: "replaceInFile",
              target: `Fix JSX closing tag of ${wrongExport}`,
              description: `Update closing tag to use ${correctExport}`,
              details: {
                filePath: error.file || "src/components/ServicesSection.jsx",
                oldString: `</${wrongExport}`,
                newString: `</${correctExport}`
              }
            });
          }
        }
      }
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
          if (componentName && componentName !== 'button' && componentName !== 'card') {
            componentsToAdd.add(componentName);
          }
        }
      }

      if (componentsToAdd.size > 0) {
        fixPlan.push({
          priority: 2,
          action: "executeCommand",
          target: Array.from(componentsToAdd).join(", "),
          description: `Add missing shadcn/ui components: ${Array.from(componentsToAdd).join(", ")}`,
          details: {
            command: `bunx --bun shadcn@latest add ${Array.from(componentsToAdd).join(" ")} --yes`
          }
        });
      }
    }
  }

  if (fixPlan.length === 0 && errors.length > 0) {
    fixPlan.push({
      priority: 3,
      action: "executeCommand",
      target: "dependencies",
      description: "Reinstall dependencies to fix module resolution",
      details: { command: "bun install" }
    });
  }

  return fixPlan;
}

export const intelligentErrorFixer = tool(
  async (input: z.infer<typeof errorFixerInput>) => {
    const { errors, errorAnalysis, context, previousAttempts } = errorFixerInput.parse(input);

    const normalizedErrors = errors.map((err: any) => {
      if (typeof err === 'string') {
        return {
          type: 'unknown',
          severity: 'major',
          message: err,
          fixable: true
        };
      }
      return err;
    });

    const fullBuildError = context?.fullBuildError || "";

    const errorSummary = `
FULL BUILD ERROR OUTPUT:
======================
${fullBuildError}
======================

Build Errors Analysis:
- Total Errors: ${errorAnalysis?.totalErrors || normalizedErrors.length}
- Critical: ${errorAnalysis?.criticalCount || 0}
- Major: ${errorAnalysis?.majorCount || 0}
- Minor: ${errorAnalysis?.minorCount || 0}
- Fixable: ${errorAnalysis?.fixableCount || 0}

Error Types:
${Object.entries(errorAnalysis?.errorsByType || {})
        .filter(([_, count]) => (count as number) > 0)
        .map(([type, count]) => `- ${type}: ${count}`)
        .join('\n')}

Parsed Errors:
${normalizedErrors.slice(0, 10).map((err, idx) => `${idx + 1}. [${err.severity}] ${err.type}: ${err.message}${err.file ? ` (${err.file}${err.line ? `:${err.line}` : ''})` : ''}`).join('\n')}

${previousAttempts && previousAttempts.length > 0 ? `
Previous Fix Attempts (that failed):
${previousAttempts.map((attempt, idx) => `${idx + 1}. ${attempt}`).join('\n')}
` : ''}

Project Context:
- Available dependencies: ${context?.dependencies?.join(', ') || 'unknown'}
- React version: ${context?.dependencies?.includes('react') ? 'installed' : 'check package.json'}
`;

    const systemPrompt = `You are an expert JavaScript/React error fixer. Analyze the FULL BUILD ERROR OUTPUT carefully to extract exact package names and create fixes.

CRITICAL INSTRUCTIONS:
1. Read the FULL BUILD ERROR OUTPUT section to find the EXACT package/module names
2. For Vite/Rollup errors like "failed to resolve import '@radix-ui/react-label'":
   - Extract the EXACT package name from the error (e.g., @radix-ui/react-label)
   - Create an addDependency action with that exact package name
3. For missing exports like '"Tools" is not exported by "lucide-react"':
   - This means the import name is WRONG, not missing
   - For lucide-react, common icons are: Tool (singular), Wrench, Hammer, Settings, Cog, HardHat
   - Use replaceInFile action to fix the import statement
   - Use replaceInFile action again to fix JSX usage
4. Always prioritize addDependency for missing modules over other fixes

Fix Action Types:
- addDependency: { packages: ["exact-package-name"] } - For missing npm packages
- replaceInFile: { filePath, oldString, newString } - For find-and-replace in files (fixing imports, renaming)
- updateFile: { filePath, content } - For replacing entire file content
- createFile: { filePath, content } - For creating missing files
- executeCommand: { command } - For running shell commands

RESPONSE FORMAT (return ONLY this JSON, no markdown, no backticks):
[
  {
    "priority": 1,
    "action": "replaceInFile",
    "target": "src/components/ServicesSection.jsx",
    "description": "Fix invalid lucide-react import: Tools -> Tool",
    "details": {
      "filePath": "src/components/ServicesSection.jsx",
      "oldString": "import { Construction, Building, Tools } from 'lucide-react';",
      "newString": "import { Construction, Building, Tool } from 'lucide-react';"
    }
  },
  {
    "priority": 2,
    "action": "replaceInFile",
    "target": "src/components/ServicesSection.jsx",
    "description": "Update JSX to use Tool instead of Tools",
    "details": {
      "filePath": "src/components/ServicesSection.jsx",
      "oldString": "<Tools",
      "newString": "<Tool"
    }
  }
]

CRITICAL: Return ONLY the JSON array. NO markdown code blocks, NO explanations, JUST the JSON array starting with [ and ending with ].`;

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
        
        console.log("[intelligentErrorFixer] Successfully parsed fix plan with", fixPlan.length, "actions");
        console.log("[intelligentErrorFixer] First action:", JSON.stringify(fixPlan[0], null, 2));

      } catch (parseError) {
        console.error("[intelligentErrorFixer] Failed to parse AI response as JSON:", parseError);
        console.error("[intelligentErrorFixer] AI response text:", response.text);

        // Fallback: Create a simple fix plan based on error types
        console.log("Creating fallback fix plan...");
        fixPlan = createFallbackFixPlan(normalizedErrors, errorAnalysis, fullBuildError);

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

export async function intelligentFixErrorsNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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
  };
}
