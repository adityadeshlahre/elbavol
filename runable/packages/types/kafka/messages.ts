export interface KafkaMessagePayload {
  type: "AGENT_COMPLETED" | "AGENT_FAILED" | "AGENT_ERROR" | "PROJECT_INITIALIZED" | "SERVE_PROJECT_INITIALIZED" | "PROJECT_BUILD";
  projectId?: string;
  result?: string;
  error?: string;
  iterations?: number;
  timestamp: string;
}

export interface AgentKafkaMessage {
  key: string;
  value: string;
}

export interface ProjectInitializationData {
  projectId: string;
  bucketName: string;
  timestamp: string;
  filesCount: number;
}
