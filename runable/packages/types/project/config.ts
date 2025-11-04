export interface ProjectMetadata {
  id: string;
  name?: string;
  created: string;
  lastModified: string;
  status: "initializing" | "ready" | "building" | "running" | "error";
  version?: string;
  description?: string;
}

export interface ProjectConfig {
  framework: "react" | "vue" | "angular" | "next" | "vite";
  language: "typescript" | "javascript";
  styling: "tailwind" | "css" | "scss" | "styled-components";
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
}

export interface ProjectStructure {
  rootPath: string;
  sourceDir: string;
  buildDir: string;
  assetsDir: string;
  configFiles: string[];
  entryPoint: string;
}

export interface ProjectDependencies {
  production: Record<string, string>;
  development: Record<string, string>;
  peer?: Record<string, string>;
}
