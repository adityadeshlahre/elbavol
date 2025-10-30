import { TOPIC } from "@elbavol/constants"
import { getObject, listObjects } from "@elbavol/r2"
import type { Producer } from "kafkajs"

export const pushProjectCreatedToQueue = async (projectId: string, producer: Producer) => {
    const { $metadata, Contents } = await listObjects({
        Bucket: projectId,
        MaxKeys: 1,
    })

    await getObject({
        Bucket: projectId,
        Key: Contents && Contents.length > 0 && Contents[0] && Contents[0].Key ? Contents[0].Key : "",
    }).then(() => { }).catch(() => { }).finally(() => { })


    if ($metadata.httpStatusCode !== 200) {
        console.error(`Failed to access bucket for project ${projectId}`)
        return false
    }

    try {
        await producer.send({
            topic: TOPIC.PROJECT_CREATED,
            messages: [
                { key: projectId, value: JSON.stringify({ projectId }) }
            ]
        })
    } catch (error) {
        console.error(`Failed to produce PROJECT_CREATED for project ${projectId}:`, error)
        return false
    }
}