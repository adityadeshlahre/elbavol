import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import type { Producer } from "kafkajs";

export const pushProjectInitializationToServingPod = async (
	projectId: string,
	producer: Producer,
) => {
	try {
		await producer.send({
			topic: TOPIC.BETWEEN_PODS,
			messages: [{ key: projectId, value: MESSAGE_KEYS.PROJECT_INITIALIZED }],
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
