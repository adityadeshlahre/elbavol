import { createBucket } from "@elbavol/r2";
import { GROUP_ID, TOPIC } from "@elbavol/constants";
import type { Producer } from "kafkajs";
// import { processing } from ".."

export const pushProjectInitializationToServingPod = async (
    projectId: string,
    producer: Producer,
) => {
    const { $metadata } = await createBucket({
        Bucket: projectId,
    });

    if ($metadata.httpStatusCode !== 200) {
        console.error(`Failed to create bucket for project ${projectId}`);
        return false;
    }

    try {
        await producer.send({
            topic: TOPIC.BETWEEN_PODS,
            messages: [
                { key: projectId, value: JSON.stringify(TOPIC.PROJECT_INITIALIZED) },
            ],
        });
    } catch (error) {
        console.error(
            `Failed to produce PROJECT_INITIALIZED for project ${projectId}:`,
            error,
        );
        return false;
    }
};

// export const waitForProjectInitializationConfirmation = async (projectId: string): Promise<{ productId: string }> => {
//     return new Promise((resolve, reject) => {
//         processing.set(projectId, (value: {
//             success: boolean,
//             payload?: string | undefined
//         }) => {
//             if (value.success && value.payload) {
//                 try {
//                     const payload = JSON.parse(value.payload)
//                     resolve({ productId: payload.productId })
//                 } catch (error) {
//                     reject(error)
//                 }
//             } else {
//                 reject(new Error(`Project initialization failed for project ${projectId}`))
//             }
//         })
//     })
// }

