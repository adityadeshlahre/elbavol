import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/workflow";
import { allTools } from "@/agent/graphs/main";

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

export async function fixErrorsNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "fixing",
    message: "Analyzing and fixing errors...",
  });

  console.log("[fixErrorsNode] buildErrors:", JSON.stringify(state.buildErrors, null, 2));
  console.log("[fixErrorsNode] buildOutput:", state.buildOutput?.substring(0, 500));

  const fixPlanResult = await intelligentErrorFixer.invoke({
    projectId: state.projectId,
    errors: state.buildErrors || [],
    errorAnalysis: state.errorAnalysis,
    context: {
      ...state.context,
      fullBuildError: state.buildOutput || state.error || "",
    },
    previousAttempts: [],
  }) as any;

  if (!fixPlanResult.success || !fixPlanResult.fixPlan) {
    sendSSEMessage(state.clientId, {
      type: "fixing_failed",
      message: "Failed to generate fix plan",
    });
    return {
      fixAttempts: state.fixAttempts + 1,
    };
  }

  sendSSEMessage(state.clientId, {
    type: "fix_plan_generated",
    message: `Generated ${fixPlanResult.fixPlan.length} fix actions`,
  });

  const toolMap = allTools.reduce(
    (acc, tool) => {
      acc[tool.name] = tool;
      return acc;
    },
    {} as Record<string, any>,
  );

  let successCount = 0;
  for (const action of fixPlanResult.fixPlan.slice(0, 10)) {
    try {
      sendSSEMessage(state.clientId, {
        type: "executing_fix",
        message: action.description || `Executing ${action.action}`,
      });

      const tool = toolMap[action.action];
      if (!tool) {
        console.warn(`Tool ${action.action} not found in toolMap`);
        if (action.action === "addDependency" && action.details?.packages) {
          const addDepTool = toolMap["addDependency"];
          if (addDepTool) {
            const result = await addDepTool.invoke({
              packages: action.details.packages,
              cwd: action.details.cwd,
            });
            if (result.success) successCount++;
          }
        } else if (action.action === "executeCommand" && action.details?.command) {
          const cmdTool = toolMap["executeCommand"];
          if (cmdTool) {
            const result = await cmdTool.invoke({
              command: action.details.command,
              cwd: action.details.cwd,
            });
            if (result.success) successCount++;
          }
        } else if (action.action === "replaceInFile" && action.details?.filePath) {
          const replaceTool = toolMap["replaceInFile"];
          if (replaceTool) {
            const result = await replaceTool.invoke({
              filePath: action.details.filePath,
              oldString: action.details.oldString,
              newString: action.details.newString,
            });
            if (result.success) successCount++;
          }
        }
        continue;
      }

      console.log(`[fixErrorsNode] Invoking tool: ${action.action} with details:`, JSON.stringify(action.details).substring(0, 200));
      const result = await tool.invoke(action.details);
      console.log(`[fixErrorsNode] Tool ${action.action} result:`, result);

      if (result?.success !== false) {
        successCount++;
        sendSSEMessage(state.clientId, {
          type: "fix_success",
          message: `✓ ${action.description || action.action}`,
        });
      } else {
        console.warn(`[fixErrorsNode] Tool ${action.action} returned success=false:`, result);
      }
    } catch (error) {
      console.error(`[fixErrorsNode] Fix action failed for ${action.action}:`, error);
      console.error(`[fixErrorsNode] Action details:`, JSON.stringify(action.details, null, 2));
      sendSSEMessage(state.clientId, {
        type: "fix_error",
        message: `✗ ${action.description || action.action}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  sendSSEMessage(state.clientId, {
    type: "fixing_complete",
    message: `Applied ${successCount}/${fixPlanResult.fixPlan.length} fixes successfully`,
  });

  const noFixesGenerated = fixPlanResult.fixPlan.length === 0;

  if (noFixesGenerated) {
    console.warn("[fixErrorsNode] No fixes were generated by LLM or fallback!");
    sendSSEMessage(state.clientId, {
      type: "warning",
      message: "No fixes could be generated for the errors. The LLM may not know how to fix this issue.",
    });
  }

  return {
    fixAttempts: state.fixAttempts + 1,
    fixesApplied: !noFixesGenerated,
    noFixesAvailable: noFixesGenerated && state.fixAttempts >= 2,
  };
}
