import { createBucket } from "@elbavol/r2"
import { producer } from "../index"
import { TOPIC } from "@elbavol/constants"

export const produceProjectInitialization = async (projectId: string): Promise<boolean> => {


    const { $metadata } = await createBucket({
        Bucket: projectId,
    })

    if ($metadata.httpStatusCode !== 200) {
        console.error(`Failed to create bucket for project ${projectId}`)
        return false
    }

    await producer.send({
        topic: TOPIC.PROJECT_INITIALIZED,
        messages: [
            { key: projectId, value: JSON.stringify({ projectId }) }
        ]
    })

    return true
}