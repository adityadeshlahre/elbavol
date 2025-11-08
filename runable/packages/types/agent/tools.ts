export interface PromptAnalysis {
  intent:
    | "creation"
    | "debugging"
    | "modification"
    | "validation"
    | "information"
    | "general";
  complexity: "low" | "medium" | "high";
  requiredTools: string[];
  actionPlan: string[];
  priority: "low" | "medium" | "high" | "urgent";
  estimatedTime: number;
  projectId: string;
  context: any;
}

export interface PromptAnalysisResponse {
  success: boolean;
  analysis: PromptAnalysis;
  recommendations: string[];
  systemPrompt: string;
}

export interface PromptAnalyzerInput {
  prompt: string;
  projectId: string;
  context?: any;
}

export interface ToolExecutorInput {
  projectId: string;
  toolName: string;
  toolInput: any;
}

export interface ContextManagerInput {
  projectId: string;
  action: "load" | "save" | "update";
  data?: any;
}
