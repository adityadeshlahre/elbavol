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

// Agent types
export type {
  AgentState,
  ProjectContext,
  ToolExecution,
  WorkflowConfig,
  AgentResponse
} from "./agent/state";

export type {
  PromptAnalysis,
  PromptAnalysisResponse,
  PromptAnalyzerInput,
  ToolExecutorInput,
  ContextManagerInput
} from "./agent/tools";

export type {
  AgentInterfaceResponse,
  ProjectStatusResponse,
  ProjectResetResponse,
  AgentHandlerStatus
} from "./agent/interface";

// Kafka types
export type {
  KafkaMessagePayload,
  AgentKafkaMessage,
  ProjectInitializationData
} from "./kafka/messages";

// Operation types
export type {
  FileOperation,
  DependencyOperation,
  BuildOperation,
  CommandExecution
} from "./operations/file";

// Project types
export type {
  ProjectMetadata,
  ProjectConfig,
  ProjectStructure,
  ProjectDependencies
} from "./project/config";

// Serve pod types
export type {
  ServePodOperation,
  ProjectFetchResult,
  ProjectServeResult,
  ServerProcess
} from "./serve/operations";

// R2 storage types
export type {
  R2ObjectInfo,
  R2ListResult,
  R2UploadParams,
  R2DownloadParams,
  R2ListParams,
  R2OperationResult
} from "./r2/storage";

// Kubernetes types
export type {
  K8sDeploymentConfig,
  K8sContainerConfig,
  K8sEnvVar,
  K8sVolumeConfig,
  K8sVolumeMount,
  K8sServiceConfig,
  K8sServicePort,
  K8sOperationResult
} from "./k8s/resources";

// Orchestrator types
export type {
  OrchestratorOperation,
  ProjectCreationRequest,
  ProjectConfiguration,
  OrchestratorResponse
} from "./orchestrator/operations";

// API types
export type {
  CreateProjectRequest,
  CreateProjectResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  ProjectStatusRequest,
  ApiProjectStatusResponse,
  ApiResponse
} from "./api/prime";

// Utility types
export type {
  AsyncResult,
  OperationStatus,
  LogLevel,
  LogEntry,
  TimestampedRecord,
  PaginationParams,
  PaginatedResponse
} from "./common/utils";
