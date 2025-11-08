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
    processing.set(
      projectId,
      (value: { success: boolean; payload?: string | undefined }) => {
        if (value.success && value.payload) {
          try {
            const payload = JSON.parse(value.payload);
            resolve({ projectId: payload.projectId });
          } catch (error) {
            reject(error);
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
