import { tool } from "langchain";
import * as z from "zod";
import { putObject } from "@elbavol/r2";
import fs from "fs";
import path from "path";
import { TOPIC } from "@elbavol/constants";
import { producer } from "../../../index";

const pushCodeInput = z.object({
	projectId: z.string().min(1, "Project ID is required"),
	bucketName: z.string().min(1, "Bucket name is required"),
});

function getAllFiles(dirPath: string, relativeTo: string = dirPath): string[] {
	const files: string[] = [];

	if (!fs.existsSync(dirPath)) {
		return files;
	}

	const items = fs.readdirSync(dirPath);

	for (const item of items) {
		const fullPath = path.join(dirPath, item);
		const stat = fs.statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...getAllFiles(fullPath, relativeTo));
		} else {
			files.push(path.relative(relativeTo, fullPath));
		}
	}

	return files;
}

export const pushFilesToR2 = tool(
	async (input: z.infer<typeof pushCodeInput>) => {
		const { projectId, bucketName = "elbavol" } = pushCodeInput.parse(input);

		try {
			const sharedDir = "/app/shared";
			const projectDir = path.join(sharedDir, projectId);

			if (!fs.existsSync(projectDir)) {
				throw new Error(`Project directory ${projectDir} does not exist`);
			}

			const files = getAllFiles(projectDir);

			if (files.length === 0) {
				throw new Error("No files found in project directory");
			}

			let uploadedCount = 0;

			for (const filePath of files) {
				try {
					const fullFilePath = path.join(projectDir, filePath);
					const fileContent = fs.readFileSync(fullFilePath);

					const r2Key = `${projectId}/${filePath}`;

					await putObject({
						Bucket: bucketName,
						Key: r2Key,
						Body: fileContent,
						ContentType: getContentType(filePath),
					});

					uploadedCount++;
				} catch (error) {
					console.error(`Failed to upload ${filePath}:`, error);
				}
			}

			const newObject = {
				projectId,
				bucketName,
				status: "code_pushed",
				timestamp: new Date().toISOString(),
				filesUploaded: uploadedCount,
			};

			await producer.send({
				topic: TOPIC.CONTROL_TO_SERVING,
				messages: [{ key: projectId, value: JSON.stringify(newObject) }],
			}); // push build again

			return {
				success: true,
				message: `Successfully pushed ${uploadedCount} files to R2 for project ${projectId}`,
				projectId,
				bucketName,
				filesUploaded: uploadedCount,
				newObject,
			};
		} catch (error) {
			console.error("Error in pushFilesToR2:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				success: false,
				message: `Failed to push files for project ${projectId}: ${errorMessage}`,
				projectId,
				bucketName,
				error: errorMessage,
			};
		}
	},
	{
		name: "pushFilesToR2",
		description:
			"Pushes all files from the shared project directory to R2 bucket with projectId prefix.",
		schema: pushCodeInput,
	},
);

function getContentType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();

	const contentTypes: Record<string, string> = {
		".js": "application/javascript",
		".jsx": "application/javascript",
		".ts": "application/typescript",
		".tsx": "application/typescript",
		".json": "application/json",
		".html": "text/html",
		".css": "text/css",
		".md": "text/markdown",
		".txt": "text/plain",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".svg": "image/svg+xml",
	};

	return contentTypes[ext] || "application/octet-stream";
}
