import { getObject, listObjects } from "@elbavol/r2";
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
