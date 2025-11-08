// Topics
export const TOPICS = {
  PROJECT: "PROJECT_TOPIC",
  BROKER: "BROKER_TOPIC",
  POD: "POD_TOPIC",
} as const;

// Group IDs
export const GROUP_IDS = {
  PROJECT: "PROJECT_GROUP_ID",
  BROKER: "BROKER_GROUP_ID",
  POD: "POD_GROUP_ID",
} as const;

// Type exports for better TypeScript support
export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
export type GroupId = (typeof GROUP_IDS)[keyof typeof GROUP_IDS];

export type {
  AgentHandlerStatus,
  AgentInterfaceResponse,
  ProjectResetResponse,
  ProjectStatusResponse,
} from "./agent/interface";
// Agent types
export type {
  AgentResponse,
  AgentState,
  ProjectContext,
  ToolExecution,
  WorkflowConfig,
} from "./agent/state";
export type {
  ContextManagerInput,
  PromptAnalysis,
  PromptAnalysisResponse,
  PromptAnalyzerInput,
  ToolExecutorInput,
} from "./agent/tools";
// API types
export type {
  ApiProjectStatusResponse,
  ApiResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectStatusRequest,
} from "./api/prime";
// Utility types
export type {
  AsyncResult,
  LogEntry,
  LogLevel,
  OperationStatus,
  PaginatedResponse,
  PaginationParams,
  TimestampedRecord,
} from "./common/utils";
// Kubernetes types
export type {
  K8sContainerConfig,
  K8sDeploymentConfig,
  K8sEnvVar,
  K8sOperationResult,
  K8sServiceConfig,
  K8sServicePort,
  K8sVolumeConfig,
  K8sVolumeMount,
} from "./k8s/resources";
// Kafka types
export type {
  AgentKafkaMessage,
  KafkaMessagePayload,
  ProjectInitializationData,
} from "./kafka/messages";
// Operation types
export type {
  BuildOperation,
  CommandExecution,
  DependencyOperation,
  FileOperation,
} from "./operations/file";
// Orchestrator types
export type {
  OrchestratorOperation,
  OrchestratorResponse,
  ProjectConfiguration,
  ProjectCreationRequest,
} from "./orchestrator/operations";
// Project types
export type {
  ProjectConfig,
  ProjectDependencies,
  ProjectMetadata,
  ProjectStructure,
} from "./project/config";
// R2 storage types
export type {
  R2DownloadParams,
  R2ListParams,
  R2ListResult,
  R2ObjectInfo,
  R2OperationResult,
  R2UploadParams,
} from "./r2/storage";
// Serve pod types
export type {
  ProjectFetchResult,
  ProjectServeResult,
  ServePodOperation,
  ServerProcess,
} from "./serve/operations";
