import { TOPIC } from "@elbavol/constants"
import { getObject, listObjects } from "@elbavol/r2"
import type { Producer } from "kafkajs"
import fs from "fs"
import path from "path"

export const fetchFilesAndConfirmProject = async (projectId: string, producer: Producer) => {
    const { $metadata, Contents } = await listObjects({
        Bucket: projectId,
    })

    if ($metadata.httpStatusCode !== 200 || !Contents) {
        console.error(`Failed to list objects for project ${projectId}`)
        return false
    }

    const dir = path.join("/app/shared", projectId);
    fs.mkdirSync(dir, { recursive: true });

    for (const obj of Contents) {
        if (obj.Key) {
            const { Body } = await getObject({
                Bucket: projectId,
                Key: obj.Key,
            });
            const filePath = path.join(dir, obj.Key);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const buffer = Buffer.from(await Body?.transformToByteArray() || new Uint8Array());
            fs.writeFileSync(filePath, buffer);
        }
    }

    try {
        await producer.send({
            topic: TOPIC.SERVING_TO_ORCHESTRATOR,
            messages: [
                { key: projectId, value: TOPIC.PROJECT_CREATED }
            ]
        })
    } catch (error) {
        console.error(`Failed to produce PROJECT_CREATED for project ${projectId}:`, error)
        return false
    }

    return true
}