import { tool } from "langchain";
import * as z from "zod";
import { SYSTEM_PROMPTS } from "../../../prompt/systemPrompt";

const promptAnalyzerInput = z.object({
  prompt: z.string(),
  projectId: z.string(),
  context: z.any().optional(),
});

export const promptAnalyzer = tool(
  async (input: z.infer<typeof promptAnalyzerInput>) => {
    const { prompt, projectId, context } = promptAnalyzerInput.parse(input);

    const analysis = {
      intent: analyzeIntent(prompt),
      complexity: assessComplexity(prompt),
      requiredTools: identifyRequiredTools(prompt),
      actionPlan: generateActionPlan(prompt),
      priority: determinePriority(prompt),
      estimatedTime: estimateCompletionTime(prompt),
      projectId,
      context: context || {},
    };

    return {
      success: true,
      analysis,
      recommendations: generateRecommendations(analysis),
      systemPrompt: selectSystemPrompt(analysis.intent),
    };
  },
  {
    name: "promptAnalyzer",
    description:
      "Analyzes user prompts to determine intent, complexity, and required tools for optimal agent workflow.",
    schema: promptAnalyzerInput,
  },
);

function analyzeIntent(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (
    lowerPrompt.includes("create") ||
    lowerPrompt.includes("build") ||
    lowerPrompt.includes("make")
  ) {
    return "creation";
  }
  if (
    lowerPrompt.includes("fix") ||
    lowerPrompt.includes("error") ||
    lowerPrompt.includes("bug")
  ) {
    return "debugging";
  }
  if (
    lowerPrompt.includes("modify") ||
    lowerPrompt.includes("update") ||
    lowerPrompt.includes("change")
  ) {
    return "modification";
  }
  if (
    lowerPrompt.includes("test") ||
    lowerPrompt.includes("validate") ||
    lowerPrompt.includes("check")
  ) {
    return "validation";
  }
  if (
    lowerPrompt.includes("explain") ||
    lowerPrompt.includes("help") ||
    lowerPrompt.includes("show")
  ) {
    return "information";
  }

  return "general";
}

function assessComplexity(prompt: string): "low" | "medium" | "high" {
  const lowerPrompt = prompt.toLowerCase();
  let complexityScore = 0;

  if (
    lowerPrompt.includes("complete") ||
    lowerPrompt.includes("entire") ||
    lowerPrompt.includes("full")
  ) {
    complexityScore += 3;
  }
  if (
    lowerPrompt.includes("multiple") ||
    lowerPrompt.includes("several") ||
    lowerPrompt.includes("many")
  ) {
    complexityScore += 2;
  }
  if (
    lowerPrompt.includes("complex") ||
    lowerPrompt.includes("advanced") ||
    lowerPrompt.includes("sophisticated")
  ) {
    complexityScore += 2;
  }
  if (
    lowerPrompt.includes("integrate") ||
    lowerPrompt.includes("connect") ||
    lowerPrompt.includes("combine")
  ) {
    complexityScore += 2;
  }
  if (
    lowerPrompt.includes("api") ||
    lowerPrompt.includes("database") ||
    lowerPrompt.includes("auth")
  ) {
    complexityScore += 1;
  }

  if (complexityScore >= 4) return "high";
  if (complexityScore >= 2) return "medium";
  return "low";
}

function identifyRequiredTools(prompt: string): string[] {
  const lowerPrompt = prompt.toLowerCase();
  const tools: string[] = [];

  if (
    lowerPrompt.includes("file") ||
    lowerPrompt.includes("create") ||
    lowerPrompt.includes("component")
  ) {
    tools.push("createFile", "writeMultipleFile");
  }
  if (
    lowerPrompt.includes("read") ||
    lowerPrompt.includes("check") ||
    lowerPrompt.includes("see")
  ) {
    tools.push("readFile", "listDir");
  }
  if (
    lowerPrompt.includes("install") ||
    lowerPrompt.includes("dependency") ||
    lowerPrompt.includes("package")
  ) {
    tools.push("addDependency", "executeCommand");
  }
  if (
    lowerPrompt.includes("build") ||
    lowerPrompt.includes("compile") ||
    lowerPrompt.includes("test")
  ) {
    tools.push("buildSource", "testBuild", "validateBuild");
  }
  if (
    lowerPrompt.includes("update") ||
    lowerPrompt.includes("modify") ||
    lowerPrompt.includes("change")
  ) {
    tools.push("updateFile", "readFile");
  }
  if (lowerPrompt.includes("delete") || lowerPrompt.includes("remove")) {
    tools.push("deleteFile", "removeDependency");
  }

  tools.push("getContext", "saveContext");

  return [...new Set(tools)];
}

function generateActionPlan(prompt: string): string[] {
  const intent = analyzeIntent(prompt);

  const basePlan = [
    "Load project context",
    "Analyze current state",
    "Plan implementation",
  ];

  switch (intent) {
    case "creation":
      return [
        ...basePlan,
        "Check existing structure",
        "Create required files",
        "Implement functionality",
        "Test and validate",
        "Save context",
      ];

    case "modification":
      return [
        ...basePlan,
        "Read existing files",
        "Identify changes needed",
        "Update files",
        "Test changes",
        "Save context",
      ];

    case "debugging":
      return [
        ...basePlan,
        "Identify error source",
        "Analyze code structure",
        "Apply fixes",
        "Validate solution",
        "Save context",
      ];

    default:
      return [
        ...basePlan,
        "Execute requested action",
        "Verify completion",
        "Save context",
      ];
  }
}

function determinePriority(
  prompt: string,
): "low" | "medium" | "high" | "urgent" {
  const lowerPrompt = prompt.toLowerCase();

  if (
    lowerPrompt.includes("urgent") ||
    lowerPrompt.includes("critical") ||
    lowerPrompt.includes("asap")
  ) {
    return "urgent";
  }
  if (
    lowerPrompt.includes("important") ||
    lowerPrompt.includes("priority") ||
    lowerPrompt.includes("needed")
  ) {
    return "high";
  }
  if (
    lowerPrompt.includes("fix") ||
    lowerPrompt.includes("error") ||
    lowerPrompt.includes("bug")
  ) {
    return "high";
  }

  return "medium";
}

function estimateCompletionTime(prompt: string): number {
  const complexity = assessComplexity(prompt);
  const toolCount = identifyRequiredTools(prompt).length;

  let baseTime = 30;

  switch (complexity) {
    case "high":
      baseTime = 180;
      break;
    case "medium":
      baseTime = 90;
      break;
    case "low":
      baseTime = 30;
      break;
  }

  return baseTime + toolCount * 10;
}

function generateRecommendations(analysis: any): string[] {
  const recommendations: string[] = [];

  if (analysis.complexity === "high") {
    recommendations.push("Consider breaking this into smaller tasks");
    recommendations.push("Increase timeout and iteration limits");
  }

  if (analysis.requiredTools.length > 8) {
    recommendations.push("Complex task detected - monitor closely");
  }

  if (analysis.intent === "creation") {
    recommendations.push("Ensure proper file structure and imports");
    recommendations.push("Validate component integration");
  }

  if (analysis.priority === "urgent") {
    recommendations.push("Execute immediately with full resources");
  }

  return recommendations;
}

function selectSystemPrompt(intent: string): string {
  switch (intent) {
    case "creation":
      return SYSTEM_PROMPTS.PROJECT_INITIALIZE_PROMPT;
    case "debugging":
      return SYSTEM_PROMPTS.APP_CHECKER_PROMPT;
    case "validation":
      return SYSTEM_PROMPTS.IMPORT_CHECKER_PROMPT;
    default:
      return SYSTEM_PROMPTS.PROJECT_INITIALIZE_PROMPT;
  }
}
