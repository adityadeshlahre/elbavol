export interface FileOperation {
  type: "create" | "read" | "update" | "delete" | "list";
  path: string;
  content?: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface DependencyOperation {
  type: "add" | "remove";
  packageName: string;
  version?: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

export interface BuildOperation {
  type: "build" | "test" | "validate";
  projectPath: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: string;
}

export interface CommandExecution {
  command: string;
  workingDirectory: string;
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  timestamp: string;
}
