export interface K8sDeploymentConfig {
  name: string;
  namespace: string;
  projectId: string;
  replicas: number;
  containers: K8sContainerConfig[];
  volumes?: K8sVolumeConfig[];
}

export interface K8sContainerConfig {
  name: string;
  image: string;
  ports?: number[];
  env?: K8sEnvVar[];
  volumeMounts?: K8sVolumeMount[];
}

export interface K8sEnvVar {
  name: string;
  value: string;
}

export interface K8sVolumeConfig {
  name: string;
  type: "emptyDir" | "configMap" | "secret";
}

export interface K8sVolumeMount {
  name: string;
  mountPath: string;
}

export interface K8sServiceConfig {
  name: string;
  namespace: string;
  projectId: string;
  ports: K8sServicePort[];
  type: "ClusterIP" | "NodePort" | "LoadBalancer";
}

export interface K8sServicePort {
  name: string;
  port: number;
  targetPort: number;
}

export interface K8sOperationResult {
  success: boolean;
  resourceName: string;
  operation: "create" | "update" | "delete" | "get";
  error?: string;
}
