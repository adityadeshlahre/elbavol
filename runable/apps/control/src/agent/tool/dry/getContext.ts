import type { WorkflowState } from "@/agent/graphs/workflow";
import { sendSSEMessage } from "@/sse";
import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const IGNORE_PATTERNS = [
  'node_modules',
  '.turbo',
  'dist',
  'dist-ssr',
  'build',
  'out',
  'coverage',
  '.nyc_output',
  '.cache',
  'tmp',
  'temp',
  '.git',
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  '.DS_Store',
  '*.log',
  '*.tsbuildinfo',
  '*.tgz',
  '.vscode',
  '.idea',
  '*.swp',
  '*.swo',
  'logs',
  '.pnp',
  '.pnp.js',
  '*.local',
  'bun.lockb'
];

function shouldIgnoreFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(normalizedPath);
    }
    return normalizedPath.includes(pattern);
  });
}

const getContextInput = z.object({
  projectId: z.string(),
});

export const getContext = tool(
  async (input: z.infer<typeof getContextInput>) => {
    const { projectId } = getContextInput.parse(input);
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);

    const context: Record<string, any> = {
      projectId,
      projectPath: projectDir,
      baseTemplate: {
        exists: false,
        description: "React 19 + JavaScript + Bun + Tailwind CSS v4 + shadcn/ui base template",
        features: [
          "React 19 with JavaScript",
          "Bun runtime and package manager",
          "Tailwind CSS v4 (latest)",
          "shadcn/ui components (Button, Card, Input, Label, Textarea)",
          "Lucide React icons",
          "Hot reload enabled",
          "Pre-configured build system"
        ],
        availableComponents: [
          "@/components/ui/button - Button component",
          "@/components/ui/card - Card component",
          "@/components/ui/input - Input component",
          "@/components/ui/label - Label component",
          "@/components/ui/textarea - Textarea component"
        ],
        utilities: [
          "@/lib/utils - cn() function for class merging"
        ]
      },
      fileStructure: {},
      dependencies: [],
      currentFiles: {},
      metadata: {
        lastModified: new Date().toISOString(),
        totalFiles: 0,
        buildStatus: "pending",
      },
    };

    try {
      if (fs.existsSync(projectDir)) {
        context.baseTemplate.exists = true;

        const files = fs.readdirSync(projectDir, { recursive: true });
        const fileList = files
          .map((file: any) => typeof file === 'string' ? file : file.toString())
          .filter((file: string) => !shouldIgnoreFile(file));

        context.metadata.totalFiles = fileList.length;

        context.fileStructure = {
          root: projectDir,
          files: fileList.slice(0, 100),
          hasMore: fileList.length > 100
        };

        const keyFiles = [
          "package.json",
          "src/App.jsx",
          "src/index.jsx",
          "src/index.js",
          "src/index.css",
          "src/lib/utils.js",
          "components.json"
        ];

        const MAX_FILE_SIZE = 50 * 1024;

        for (const file of keyFiles) {
          const filePath = path.join(projectDir, file);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);

            if (stats.size > MAX_FILE_SIZE) {
              context.currentFiles[file] = `[File too large: ${(stats.size / 1024).toFixed(2)}KB]`;
              continue;
            }

            const content = fs.readFileSync(filePath, "utf8");

            if (content.length > 10000) {
              context.currentFiles[file] = content.slice(0, 10000) + "\n\n... [truncated]";
            } else {
              context.currentFiles[file] = content;
            }
          }
        }

        const componentsUiDir = path.join(projectDir, "src/components/ui");
        if (fs.existsSync(componentsUiDir)) {
          const uiComponents = fs.readdirSync(componentsUiDir)
            .filter(file => file.endsWith('.jsx'))
            .map(file => file.replace('.jsx', ''));
          context.baseTemplate.installedComponents = uiComponents;
        }

        // Get dependencies from package.json
        const packagePath = path.join(projectDir, "package.json");
        if (fs.existsSync(packagePath)) {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
          context.dependencies = Object.keys(packageJson.dependencies || {});
          context.devDependencies = Object.keys(packageJson.devDependencies || {});
          context.scripts = packageJson.scripts || {};
        }
      } else {
        context.error = "Project directory does not exist at " + projectDir;
        context.metadata.buildStatus = "missing";
      }
    } catch (error) {
      context.error = `Error getting context: ${(error as Error).message}`;
    }

    return { context };
  },
  {
    name: "getContext",
    description:
      "Retrieves project context including file structure, dependencies, and key files.",
    schema: getContextInput,
  },
);


export async function getProjectContext(
  state: WorkflowState,
): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "context",
    message: "Getting project context...",
  });
  const result = await getContext.invoke({ projectId: state.projectId });

  let context = result.context;

  try {
    const fs = await import("fs");
    const path = await import("path");
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const contextPath = path.join(sharedDir, `${state.projectId}/context.json`);

    if (fs.existsSync(contextPath)) {
      const previousContext = JSON.parse(fs.readFileSync(contextPath, "utf8"));
      context = {
        ...previousContext,
        ...context,
        metadata: {
          ...previousContext.metadata,
          ...context.metadata,
          lastModified: new Date().toISOString(),
        },
      };
      sendSSEMessage(state.clientId, {
        type: "context",
        message: "Loaded previous context and merged",
      });
    }
  } catch (error) {
    console.warn("Failed to load previous context:", error);
  }

  return { context };
}