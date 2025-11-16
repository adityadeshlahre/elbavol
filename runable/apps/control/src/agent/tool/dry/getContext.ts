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
        const files = fs.readdirSync(projectDir, { recursive: true });
        context.metadata.totalFiles = files.length;

        // Read key files
        const keyFiles = ["package.json", "src/index.ts", "src/App.tsx"];
        for (const file of keyFiles) {
          const filePath = path.join(projectDir, file);
          if (fs.existsSync(filePath)) {
            context.currentFiles[file] = fs.readFileSync(filePath, "utf8");
          }
        }

        // Get dependencies from package.json
        const packagePath = path.join(projectDir, "package.json");
        if (fs.existsSync(packagePath)) {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
          context.dependencies = Object.keys(packageJson.dependencies || {});
        }
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