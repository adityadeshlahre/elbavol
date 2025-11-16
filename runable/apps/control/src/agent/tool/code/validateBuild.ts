import fs from "fs";
import path from "path";
import { tool } from "langchain";
import * as z from "zod";
import type { GraphState } from "@/agent/graphs/main";
import { sendSSEMessage } from "@/sse";

const validateBuildInput = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  userInstructions: z.string().min(1, "User instructions are required"),
});

export const validateBuild = tool(
  async (input: z.infer<typeof validateBuildInput>) => {
    const { projectId, userInstructions } = validateBuildInput.parse(input);

    try {
      const sharedDir = process.env.SHARED_DIR || "/app/shared";
      const projectDir = path.join(sharedDir, projectId);

      if (!fs.existsSync(projectDir)) {
        return {
          success: false,
          message: "Project directory does not exist",
          projectId,
          userInstructions,
          error: "Project directory not found",
        };
      }

      const essentialFiles = ["package.json", "src/App.tsx", "src/index.tsx"];
      const missingFiles = essentialFiles.filter(file => !fs.existsSync(path.join(projectDir, file)));

      if (missingFiles.length > 0) {
        return {
          success: false,
          message: `Missing essential files: ${missingFiles.join(", ")}`,
          projectId,
          userInstructions,
          error: `Missing files: ${missingFiles.join(", ")}`,
        };
      }

      const packagePath = path.join(projectDir, "package.json");
      let packageJson;
      try {
        packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      } catch (error) {
        return {
          success: false,
          message: "Invalid package.json",
          projectId,
          userInstructions,
          error: "package.json is not valid JSON",
        };
      }

      if (!packageJson.scripts || !packageJson.scripts.build) {
        return {
          success: false,
          message: "No build script in package.json",
          projectId,
          userInstructions,
          error: "Missing build script",
        };
      }

      const { spawn } = await import("child_process");
      const buildProcess = spawn("bun", ["run", "build"], {
        cwd: projectDir,
        stdio: "pipe",
      });

      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";

        buildProcess.stdout?.on("data", (data) => {
          stdout += data.toString();
        });

        buildProcess.stderr?.on("data", (data) => {
          stderr += data.toString();
        });

        buildProcess.on("close", (code) => {
          if (code === 0) {
            const distDir = path.join(projectDir, "dist");
            if (fs.existsSync(distDir)) {
              resolve({
                success: true,
                message: "Build validation successful",
                projectId,
                userInstructions,
                buildOutput: stdout,
              });
            } else {
              resolve({
                success: false,
                message: "Build completed but no dist directory found",
                projectId,
                userInstructions,
                error: "Missing build output directory",
              });
            }
          } else {
            resolve({
              success: false,
              message: `Build failed with exit code ${code}`,
              projectId,
              userInstructions,
              error: stderr || "Build failed",
              buildOutput: stdout,
            });
          }
        });

        buildProcess.on("error", (error) => {
          resolve({
            success: false,
            message: "Build process error",
            projectId,
            userInstructions,
            error: error.message,
          });
        });
      });

    } catch (error) {
      console.error("Error in validateBuild:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: "Validation failed due to an error.",
        projectId,
        userInstructions,
        error: errorMessage,
      };
    }
  },
  {
    name: "validateBuild",
    description:
      "Validates if the build meets all the specified requirements by checking files and running build process.",
    schema: validateBuildInput,
  },
);

export async function validateBuildNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  sendSSEMessage(state.clientId, {
    type: "validating",
    message: "Validating build...",
  });
  const result = await validateBuild.invoke({
    projectId: state.projectId,
    userInstructions: state.prompt,
  }) as { success: boolean; message?: string; error?: string };
  const status = result.success ? "success" : "failed";
  return {
    buildStatus: status,
    error: result.success ? undefined : (result.error || result.message || "Build validation failed"),
  };
}