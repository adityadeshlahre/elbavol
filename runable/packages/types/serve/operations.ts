export interface ServePodOperation {
  projectId: string;
  operation: "fetch" | "serve" | "stop";
  success: boolean;
  timestamp: string;
  error?: string;
}

export interface ProjectFetchResult {
  projectId: string;
  bucketName: string;
  filesDownloaded: number;
  success: boolean;
  error?: string;
}

export interface ProjectServeResult {
  projectId: string;
  port: number;
  success: boolean;
  processId?: number;
  error?: string;
}

export interface ServerProcess {
  projectId: string;
  pid: number;
  port: number;
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  startedAt: string;
  command: string;
}
