import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const checkMissingPackageInput = z.object({
  packages: z.array(z.string()),
  cwd: z.string().optional(),
});

export const checkMissingPackage = tool(
  async (input: z.infer<typeof checkMissingPackageInput>) => {
    const { packages, cwd } = checkMissingPackageInput.parse(input);
    const projectId = process.env.PROJECT_ID || "";
    const sharedDir = process.env.SHARED_DIR || "/app/shared";
    const projectDir = path.join(sharedDir, projectId);
    const workingDir = cwd ? path.join(projectDir, cwd) : projectDir;
    const packageJsonPath = path.join(workingDir, "package.json");

    try {
      if (!fs.existsSync(packageJsonPath)) {
        return { missing: packages, error: "package.json not found" };
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      const missing = packages.filter((pkg) => !deps[pkg]);
      return { missing, installed: packages.filter((pkg) => deps[pkg]) };
    } catch (error) {
      return { error: `Failed to check packages: ${(error as Error).message}` };
    }
  },
  {
    name: "checkMissingPackage",
    description:
      "Checks which packages are missing from package.json dependencies.",
    schema: checkMissingPackageInput,
  },
);
