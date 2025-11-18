import type { GraphState } from "@/agent/graphs/main";
import { sendSSEMessage } from "@/sse";
import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

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
        context.metadata.totalFiles = files.length;

        const fileList = files
          .filter((file: any) => !file.includes('node_modules') && !file.includes('.turbo'))
          .map((file: any) => typeof file === 'string' ? file : file.toString());
        
        context.fileStructure = {
          root: projectDir,
          files: fileList.slice(0, 50),
          hasMore: fileList.length > 50
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
        
        for (const file of keyFiles) {
          const filePath = path.join(projectDir, file);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf8");
            context.currentFiles[file] = content;
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
  state: GraphState,
): Promise<Partial<GraphState>> {
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