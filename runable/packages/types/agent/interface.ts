export interface AgentInterfaceResponse {
  success: boolean;
  message: string;
  projectId: string;
  processingStarted?: boolean;
}

export interface ProjectStatusResponse {
  success: boolean;
  projectId: string;
  state?: any;
  isProcessing: boolean;
  hasState: boolean;
  summary?: string;
  error?: string;
}

export interface ProjectResetResponse {
  success: boolean;
  message: string;
  projectId: string;
}

export interface AgentHandlerStatus {
  state: any;
  isProcessing: boolean;
  hasState: boolean;
}
