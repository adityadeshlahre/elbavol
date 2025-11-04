export interface OrchestratorOperation {
  type: "create_project" | "delete_project" | "get_project" | "process_prompt";
  projectId: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface ProjectCreationRequest {
  projectId: string;
  templateSource?: string;
  configuration?: ProjectConfiguration;
}

export interface ProjectConfiguration {
  framework: string;
  features: string[];
  dependencies: string[];
}

export interface OrchestratorResponse {
  success: boolean;
  message: string;
  projectId: string;
  data?: any;
  error?: string;
}
