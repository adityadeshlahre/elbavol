import type { BaseMessage } from "@langchain/core/messages";

export interface AgentState {
  messages: BaseMessage[];
  projectId: string;
  currentTask: string;
  context: ProjectContext;
  toolExecutions: ToolExecution[];
  iteration: number;
  status: "idle" | "thinking" | "executing" | "completed" | "error";
}

export interface ProjectContext {
  fileStructure: Record<string, string>;
  dependencies: string[];
  currentFiles: Record<string, string>;
  metadata: {
    lastModified: string;
    totalFiles: number;
    buildStatus: "success" | "failed" | "pending";
  };
}

export interface ToolExecution {
  toolName: string;
  input: any;
  output: any;
  timestamp: string;
  success: boolean;
  error?: string;
}
