import { getObject, listObjects, putObject } from "@elbavol/r2";
import fs from "fs";
import path from "path";

export const fetchFilesFromSharedDir = async (projectId: string) => {
  // use-less
  console.log(`${process.env.SHARED_DIR}`);
  const bucketName = process.env.BUCKET_NAME || "elbavol";
  const dir = path.join(
    `${process.env.SHARED_DIR}` || "/app/shared",
    projectId,
  );
  fs.mkdirSync(dir, { recursive: true });

  try {
    const { Contents } = await listObjects({
      Bucket: bucketName,
      Prefix: `${projectId}/`,
    });

    if (!Contents || Contents.length === 0) {
      console.error(`No files found for project ${projectId}`);
      return false;
    }

    for (const obj of Contents) {
      if (!obj.Key) continue;

      if (obj.Key === `${projectId}/`) continue;

      try {
        const { Body } = await getObject({
          Bucket: bucketName,
          Key: obj.Key,
        });

        const relativePath = obj.Key.replace(`${projectId}/`, "");
        const filePath = path.join(dir, relativePath);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        const buffer = Buffer.from(
          (await Body?.transformToByteArray()) || new Uint8Array(),
        );
        fs.writeFileSync(filePath, buffer);
      } catch (error) {
        console.error(`Failed to download ${obj.Key}:`, error);
      }
    }

    console.log(
      `Successfully fetched files and confirmed project ${projectId}`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to fetch files and confirm project ${projectId}:`,
      error,
    );
    return false;
  }
};

export const checkIfProjectFilesExist = (projectId: string): boolean => {
  const dir = path.join(
    `${process.env.SHARED_DIR}` || "/app/shared",
    projectId,
  );

  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
};

export const uploadProjectToR2 = async (projectId: string): Promise<boolean> => {
  const bucketName = process.env.BUCKET_NAME || "elbavol";
  const sharedDir = process.env.SHARED_DIR || "/app/shared";
  const projectDir = path.join(sharedDir, projectId);

  if (!checkIfProjectFilesExist(projectId)) {
    console.log(`[UPLOADER] Project ${projectId} directory not found, skipping upload`);
    return false;
  }

  try {
    const uploadFile = async (filePath: string, relativePath: string) => {
      const fileContent = fs.readFileSync(filePath);
      const key = `${projectId}/${relativePath}`;

      await putObject({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
      });

      console.log(`[UPLOADER] Uploaded: ${key}`);
    };

    const uploadDirectory = async (dirPath: string, baseDir: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          await uploadDirectory(fullPath, baseDir);
        } else {
          await uploadFile(fullPath, relativePath);
        }
      }
    };

    await uploadDirectory(projectDir, projectDir);
    console.log(`[UPLOADER] Successfully uploaded project ${projectId} to R2`);
    return true;
  } catch (error) {
    console.error(`[UPLOADER] Failed to upload project ${projectId}:`, error);
    return false;
  }
};
