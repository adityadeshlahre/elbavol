export interface CreateProjectRequest {
  name?: string;
  template?: string;
  configuration?: {
    framework: string;
    features: string[];
  };
}

export interface CreateProjectResponse {
  success: boolean;
  projectId: string;
  message: string;
  error?: string;
}

export interface ChatMessageRequest {
  prompt: string;
  context?: any;
}

export interface ChatMessageResponse {
  success: boolean;
  response: string;
  projectId: string;
  processingId?: string;
  error?: string;
}

export interface ProjectStatusRequest {
  projectId: string;
}

export interface ApiProjectStatusResponse {
  success: boolean;
  projectId: string;
  status: "initializing" | "ready" | "building" | "running" | "error";
  details?: any;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}
