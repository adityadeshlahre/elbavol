import fs from "fs";
import path from "path";
import { tool } from "langchain";
import * as z from "zod";
import type { WorkflowState } from "@/agent/graphs/workflow";
import { sendSSEMessage } from "@/sse";

const validateBuildInput = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  userInstructions: z.string().min(1, "User instructions are required"),
});

interface BuildError {
  type: "import" | "typescript" | "syntax" | "missing_file" | "dependency" | "runtime" | "unknown";
  severity: "critical" | "major" | "minor";
  message: string;
  file?: string;
  line?: number;
  fixable: boolean;
}

function parseAndCategorizeBuildErrors(stderr: string, stdout: string): BuildError[] {
  const errors: BuildError[] = [];
  const combinedOutput = stderr + "\n" + stdout;
  const lines = combinedOutput.split("\n");

  const viteErrorPattern = /failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/i;
  const viteMatch = combinedOutput.match(viteErrorPattern);
  if (viteMatch) {
    errors.push({
      type: "dependency",
      severity: "critical",
      message: `Failed to resolve import "${viteMatch[1]}" from "${viteMatch[2]}"`,
      file: viteMatch[2],
      fixable: true,
    });
  }

  for (const line of lines) {
    if (line.includes("error") || line.includes("Error") || line.includes("ERROR")) {
      const error: BuildError = {
        type: "unknown",
        severity: "major",
        message: line.trim(),
        fixable: true,
      };

      if (line.includes("Cannot find module") || line.includes("Module not found") ||
        line.includes("Could not resolve") || line.includes("failed to resolve")) {
        error.type = "dependency";
        error.severity = "critical";
        error.fixable = true;
        const match = line.match(/['"]([^'"]+)['"]/);
        if (match) {
          error.message = `Cannot resolve module: ${match[1]}`;
        }
      } else if (line.includes("TS") || line.includes("Type") || line.includes("type")) {
        error.type = "typescript";
        error.severity = "major";
        error.fixable = true;
      } else if (line.includes("SyntaxError") || line.includes("Unexpected token")) {
        error.type = "syntax";
        error.severity = "critical";
        error.fixable = true;
      } else if (line.includes("ENOENT") || line.includes("no such file")) {
        error.type = "missing_file";
        error.severity = "critical";
        error.fixable = true;
      } else if (line.includes("dependency") || line.includes("dependencies")) {
        error.type = "dependency";
        error.severity = "major";
        error.fixable = true;
      } else if (line.includes("ReferenceError") || line.includes("is not defined")) {
        error.type = "runtime";
        error.severity = "major";
        error.fixable = true;
      } else if (line.includes("is not exported by") || line.includes("has no exported member")) {
        error.type = "import";
        error.severity = "major";
        error.fixable = true;
      }

      const fileMatch = line.match(/([a-zA-Z0-9_\-\/\.]+\.(tsx?|jsx?|css)):(\d+)/);
      if (fileMatch && fileMatch[1] && fileMatch[3]) {
        error.file = fileMatch[1];
        error.line = parseInt(fileMatch[3], 10);
      }

      const isDuplicate = errors.some(e =>
        e.message === error.message && e.file === error.file && e.line === error.line
      );

      if (!isDuplicate) {
        errors.push(error);
      }
    }
  }

  return errors;
}

function categorizeBuildResult(errors: BuildError[]) {
  const critical = errors.filter(e => e.severity === "critical").length;
  const major = errors.filter(e => e.severity === "major").length;
  const minor = errors.filter(e => e.severity === "minor").length;
  const fixable = errors.filter(e => e.fixable).length;

  return {
    totalErrors: errors.length,
    criticalCount: critical,
    majorCount: major,
    minorCount: minor,
    fixableCount: fixable,
    canAttemptFix: fixable > 0 && critical < 10,
    errorsByType: {
      import: errors.filter(e => e.type === "import").length,
      typescript: errors.filter(e => e.type === "typescript").length,
      syntax: errors.filter(e => e.type === "syntax").length,
      missing_file: errors.filter(e => e.type === "missing_file").length,
      dependency: errors.filter(e => e.type === "dependency").length,
      runtime: errors.filter(e => e.type === "runtime").length,
      unknown: errors.filter(e => e.type === "unknown").length,
    },
  };
}

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

      const essentialFiles = ["package.json", "src/App.jsx", "src/index.jsx"];
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

      const installProcess = spawn("bun", ["install"], {
        cwd: projectDir,
        stdio: "pipe",
      });

      await new Promise((resolve, reject) => {
        installProcess.on("close", (code) => {
          if (code === 0) {
            resolve(code);
          } else {
            reject(new Error("Failed to install dependencies"));
          }
        });
        installProcess.on("error", reject);
      });

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
                errors: [],
                errorAnalysis: {
                  totalErrors: 0,
                  criticalCount: 0,
                  majorCount: 0,
                  minorCount: 0,
                  fixableCount: 0,
                  canAttemptFix: false,
                  errorsByType: {},
                },
              });
            } else {
              resolve({
                success: false,
                message: "Build completed but no dist directory found",
                projectId,
                userInstructions,
                error: "Missing build output directory",
                errors: [{
                  type: "missing_file",
                  severity: "critical",
                  message: "dist directory not found after build",
                  fixable: true,
                }],
              });
            }
          } else {
            const parsedErrors = parseAndCategorizeBuildErrors(stderr, stdout);
            const errorAnalysis = categorizeBuildResult(parsedErrors);

            console.log('[validateBuild] Build failed with exit code:', code);
            console.log('[validateBuild] Parsed errors:', parsedErrors.length);
            console.log('[validateBuild] stderr:', stderr.substring(0, 500));

            resolve({
              success: false,
              message: `Build failed with ${parsedErrors.length} error(s)`,
              projectId,
              userInstructions,
              error: stderr || stdout || "Build failed",
              buildOutput: stderr + "\n" + stdout,
              errors: parsedErrors,
              errorAnalysis,
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

export async function validateNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "validating",
    message: "Validating build...",
  });

  const result = await validateBuild.invoke({
    projectId: state.projectId,
    userInstructions: state.prompt,
  }) as any;

  const errorCount = result.errors?.length || 0;

  if (result.success || errorCount === 0) {
    sendSSEMessage(state.clientId, {
      type: "validation_success",
      message: "Build validation passed - no errors found",
    });
    return {
      buildStatus: "success",
      buildErrors: [],
      error: undefined,
    };
  }

  sendSSEMessage(state.clientId, {
    type: "validation_failed",
    message: `Build validation failed with ${errorCount} error(s)`,
    errors: result.errors,
    errorAnalysis: result.errorAnalysis,
  });

  return {
    buildStatus: "errors",
    buildErrors: result.errors || [],
    buildOutput: result.error || result.buildOutput || "",
    errorAnalysis: result.errorAnalysis,
  };
}