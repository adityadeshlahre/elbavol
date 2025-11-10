import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import type { Producer } from "kafkajs";
import { processing } from "../index";

export const pushProjectInitializationToServingPod = async (
  projectId: string,
  producer: Producer,
) => {
  try {
    await producer.send({
      topic: TOPIC.CONTROL_TO_SERVING,
      messages: [
        {
          key: projectId,
          value: JSON.stringify({ key: MESSAGE_KEYS.SERVING_PROJECT_INITIALIZED }),
        },
      ],
    });
  } catch (error) {
    console.error(
      `Failed to produce SERVING_PROJECT_INITIALIZED for project ${projectId}:`,
      error,
    );
    return false;
  }
};

export const waitForProjectInitializationConfirmation = async (
  projectId: string,
): Promise<{ projectId: string }> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      processing.delete(projectId);
      reject(new Error(`Timeout waiting for project initialization confirmation for ${projectId}`));
    }, 30000);

    processing.set(
      projectId,
      (value: { success: boolean; payload?: string | undefined }) => {
        clearTimeout(timeout);
        processing.delete(projectId);
        
        if (value.success && value.payload) {
          try {
            const payload = JSON.parse(value.payload);
            resolve({ projectId: payload.projectId });
          } catch (error) {
            reject(new Error(`Failed to parse confirmation payload for project ${projectId}: ${error}`));
          }
        } else {
          reject(
            new Error(`Project initialization failed for project ${projectId}`),
          );
        }
      },
    );
  });
};
