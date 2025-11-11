import { GROUP_ID, MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import "dotenv/config";
import { Kafka } from "kafkajs";
import { checkIfProjectFilesExist } from "./classes/confirm";
import { serveTheProject } from "./classes/serve";

console.log("Servering POD started with env:", {
  NODE_ENV: process.env.NODE_ENV,
  PROJECT_ID: process.env.PROJECT_ID,
  BUCKET_NAME: process.env.BUCKET_NAME,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  SHARED_DIR: process.env.SHARED_DIR,
});

export let projectRunning = false;

export const projectId = process.env.PROJECT_ID || "";
export const bucketName = process.env.BUCKET_NAME || "";

const kafkaConfig = {
  clientId: `serve-pod-${Date.now()}`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
};

const kafka = new Kafka(kafkaConfig);

export const producer = kafka.producer();

export const consumer = kafka.consumer({
  groupId: GROUP_ID.SERVING_POD,
});

export const consumerServeFromControl = kafka.consumer({
  groupId: GROUP_ID.SERVING_TO_CONTROL,
});

async function connectConsumerServeFromControl() {
  try {
    await consumerServeFromControl.connect();
    console.log("Kafka Consumer Between Pods connected.");
  } catch (error) {
    console.error("Failed to connect Kafka Consumer Between Pods:", error);
  }
}

async function disconnectConsumerServeFromControl() {
  try {
    await consumerServeFromControl.disconnect();
    console.log("Kafka Consumer Between Pods disconnected.");
  } catch (error) {
    console.error("Failed to disconnect Kafka Consumer Between Pods:", error);
  }
}

async function connectProducer() {
  try {
    await producer.connect();
    console.log("Kafka Producer connected.");
  } catch (error) {
    console.error("Failed to connect Kafka Producer:", error);
  }
}

async function connectConsumer() {
  try {
    await consumer.connect();
    console.log("Kafka Consumer connected.");
  } catch (error) {
    console.error("Failed to connect Kafka Consumer:", error);
  }
}

async function disconnectProducer() {
  try {
    await producer.disconnect();
    console.log("Kafka Producer disconnected.");
  } catch (error) {
    console.error("Failed to disconnect Kafka Producer:", error);
  }
}

async function disconnectConsumer() {
  try {
    await consumer.disconnect();
    console.log("Kafka Consumer disconnected.");
  } catch (error) {
    console.error("Failed to disconnect Kafka Consumer:", error);
  }
}

async function start() {
  console.log("Serving POD is running...");
  await connectProducer();
  await connectConsumer();
  await connectConsumerServeFromControl();

  await consumerServeFromControl.subscribe({
    topic: TOPIC.CONTROL_TO_SERVING,
  });

  await consumerServeFromControl.run({
    partitionsConsumedConcurrently: 1, // Process messages sequentially
    eachMessage: async ({ message, partition, topic }) => {
      console.log(
        `[SERVE] Received message from topic: ${topic}, partition: ${partition}`,
        JSON.stringify(message),
      );
      const projectId = message.key?.toString();
      const value = message.value?.toString();

      if (!value || !projectId) {
        console.log("Skipping message: missing projectId or value");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.log(
          `Failed to parse message: ${value} for project: ${projectId} from CONTROL_TO_SERVING`,
        );
        return;
      }
      console.log(
        `[SERVE] Processing message for project ${projectId}:`,
        parsed.key,
      );

      switch (parsed.key) {
        case MESSAGE_KEYS.SERVING_PROJECT_INITIALIZED:
          if (projectId) {
            console.log(
              `[${new Date().toISOString()}] [SERVE] Confirming project ${projectId} initialization`,
            );
            try {
              // if (!checkIfProjectFilesExist(projectId)) return;

              console.log(
                `[SERVE] Sending confirmation back to control pod for ${projectId}`,
              );
              await producer.send({
                topic: TOPIC.SERVING_TO_CONTROL,
                messages: [
                  {
                    key: projectId,
                    value: JSON.stringify({
                      key: MESSAGE_KEYS.SERVING_PROJECT_INITIALIZATION_CONFIRMED,
                      success: true,
                      payload: JSON.stringify({ projectId: projectId }),
                    }),
                  },
                ],
              });

              console.log(
                `[SERVE] Sending PROJECT_CREATED to orchestrator for ${projectId}`,
              );
              await producer.send({
                topic: TOPIC.SERVING_TO_ORCHESTRATOR,
                messages: [
                  { key: projectId, value: MESSAGE_KEYS.PROJECT_CREATED },
                ],
              });

              console.log(
                `[${new Date().toISOString()}] [SERVE] Successfully confirmed project initialization for ${projectId}`,
              );
            } catch (error) {
              console.error(
                `[SERVE] Failed to confirm project initialization for ${projectId}:`,
                error,
              );
              const errorMessage =
                error instanceof Error ? error.message : String(error);

              try {
                await producer.send({
                  topic: TOPIC.SERVING_TO_CONTROL,
                  messages: [
                    {
                      key: projectId,
                      value: JSON.stringify({
                        key: MESSAGE_KEYS.SERVING_PROJECT_INITIALIZATION_CONFIRMED,
                        success: false,
                        payload: JSON.stringify({ error: errorMessage }),
                      }),
                    },
                  ],
                }); // this is vage i think
                await producer.send({
                  topic: TOPIC.SERVING_TO_ORCHESTRATOR,
                  messages: [
                    { key: projectId, value: MESSAGE_KEYS.PROJECT_FAILED },
                  ],
                });
              } catch (sendError) {
                console.error(
                  `[SERVE] Failed to send error messages for ${projectId}:`,
                  sendError,
                );
              }
            }
          }
          break;

        case MESSAGE_KEYS.PROJECT_RUN:
          if (projectId) {
            console.log(`Fetching and serving project ${projectId}`);
            if (!checkIfProjectFilesExist(projectId)) return;
            await serveTheProject(projectId, producer);
            console.log(`Project ${projectId} is now running.`);
            projectRunning = true;
          }
          break;
        default:
          console.log(
            `Received unknown message: ${value} for project: ${projectId}`,
          );
          break;
      }
    },
  });

  await consumer.subscribe({
    topic: TOPIC.ORCHESTRATOR_TO_SERVING,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(JSON.stringify(message));
      const projectId = message.key?.toString();
      const value = message.value?.toString();

      if (!projectId || !value) return;

      switch (value) {
        default:
          console.log(
            `Received unknown message: ${value} for project: ${projectId}`,
          );
          break;
      }
    },
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT. Shutting down...");
    await disconnectConsumerServeFromControl();
    await disconnectConsumer();
    await disconnectProducer();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM. Shutting down...");
    await disconnectConsumerServeFromControl();
    await disconnectConsumer();
    await disconnectProducer();
    process.exit(0);
  });
}

start().catch((error) => {
  console.error("Error starting Serving POD:", error);
  process.exit(1);
});
