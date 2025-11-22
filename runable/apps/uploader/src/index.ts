import { GROUP_ID, MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import "dotenv/config";
import { Kafka } from "kafkajs";
import { checkIfProjectFilesExist, uploadProjectToR2 } from "./classes/confirm";

const UPLOAD_INTERVAL = 1 * 60 * 1000;

console.log("Uploader POD started with env:", {
  KAFKA_URL: process.env.KAFKA_URL,
  BUCKET_NAME: process.env.BUCKET_NAME,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  SHARED_DIR: process.env.SHARED_DIR,
});

export const projectId = process.env.PROJECT_ID || "";

const kafkaConfig = {
  clientId: `uploader-pod-${Date.now()}`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
};

const kafka = new Kafka(kafkaConfig);

const consumer = kafka.consumer({
  groupId: GROUP_ID.UPLOADER_POD,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  retry: {
    retries: 8,
  },
});

async function start() {
  console.log("[UPLOADER] Starting Uploader POD...");

  await consumer.connect();
  console.log("[UPLOADER] Kafka consumer connected");

  await consumer.subscribe({
    topic: TOPIC.CONTROL_TO_UPLOADER,
    fromBeginning: false,
  });

  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ message }) => {
      const projectId = message.key?.toString();
      const value = message.value?.toString();

      if (!projectId || !value) {
        console.log("[UPLOADER] Skipping message: missing projectId or value");
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.log(`[UPLOADER] Failed to parse message: ${value}`);
        return;
      }

      console.log(`[UPLOADER] Processing message for project ${projectId}:`, parsed.key);

      switch (parsed.key) {
        case MESSAGE_KEYS.UPLOAD_PROJECT:
          console.log(`[UPLOADER] Manual upload requested for ${projectId}`);
          await uploadProjectToR2(projectId);
          break;

        default:
          console.log(`[UPLOADER] Unknown message key: ${parsed.key}`);
          break;
      }
    },
  });

  setInterval(async () => {
    if (projectId && checkIfProjectFilesExist(projectId)) {
      console.log(`[UPLOADER] Auto-uploading project ${projectId}`);
      await uploadProjectToR2(projectId);
    } else {
      console.log(`[UPLOADER] Project ${projectId} not ready for upload, skipping...`);
    }
  }, UPLOAD_INTERVAL);

  const shutdown = async () => {
    console.log("[UPLOADER] Shutting down...");
    await consumer.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[UPLOADER] Error starting Uploader POD:", error);
  process.exit(1);
});
