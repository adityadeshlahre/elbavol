import { GROUP_ID, MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import "dotenv/config";
import { getObject, listObjects } from "@elbavol/r2";
import fs from "fs";
import { Kafka } from "kafkajs";
import path from "path";
import { processPrompt } from "./agent/process/prompt";
import { buildProjectAndNotifyToRun } from "./agent/tool/code/buildSource";
import {
  pushProjectInitializationToServingPod,
  waitForProjectInitializationConfirmation,
} from "./classes/project";
import { startSSEServer } from "./sse";

console.log("Control POD started with env:", {
  NODE_ENV: process.env.NODE_ENV,
  PROJECT_ID: process.env.PROJECT_ID,
  BUCKET_NAME: process.env.BUCKET_NAME,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  SHARED_DIR: process.env.SHARED_DIR,
});

export const ProjectId = process.env.PROJECT_ID || ""; // fix this in prod
export const bucketName = process.env.BUCKET_NAME || "";

export const processing = new Map<
  string,
  (value: { success: boolean; payload?: string }) => void
>();

const kafkaConfig = {
  clientId: `control-pod-${Date.now()}`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
};

const kafka = new Kafka(kafkaConfig);

export const producer = kafka.producer();

export const consumer = kafka.consumer({
  groupId: GROUP_ID.CONTROL_POD,
});

export const consumerControlFromServe = kafka.consumer({
  groupId: GROUP_ID.CONTROL_TO_SERVING,
});

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

async function connectConsumerControlFromServe() {
  try {
    await consumerControlFromServe.connect();
    console.log("Kafka Consumer Control From Serve connected.");
  } catch (error) {
    console.error(
      "Failed to connect Kafka Consumer Control From Serve:",
      error,
    );
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

async function disconnectConsumerControlFromServe() {
  try {
    await consumerControlFromServe.disconnect();
    console.log("Kafka Consumer Control From Serve disconnected.");
  } catch (error) {
    console.error(
      "Failed to disconnect Kafka Consumer Control From Serve:",
      error,
    );
  }
}

async function pullTemplateFromR2RenameItAsProject(
  projectId: string = ProjectId,
) {
  // fix in prod
  try {
    const { Contents } = await listObjects({
      Bucket: bucketName,
      Prefix: "template/",
    });

    if (!Contents || Contents.length === 0) {
      throw new Error("No template files found in bucket");
    }

    const sharedDir = process.env.SHARED_DIR || "/app/shared"; // fix in prod
    const projectDir = path.join(sharedDir, projectId);

    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }

    fs.mkdirSync(projectDir, { recursive: true });

    for (const obj of Contents) {
      if (!obj.Key) continue;

      if (obj.Key === "template/") continue;

      const relativePath = obj.Key.replace("template/", "");

      try {
        const { Body } = await getObject({
          Bucket: bucketName,
          Key: obj.Key,
        });

        const filePath = path.join(projectDir, relativePath);

        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        const buffer = Buffer.from(
          (await Body?.transformToByteArray()) || new Uint8Array(),
        );
        fs.writeFileSync(filePath, buffer);
      } catch (error) {
        console.error(`Failed to download ${obj.Key}:`, error);
      }
    }

    // return {
    // 	success: true,
    // 	message: `Successfully pulled template code for project ${projectId}`,
    // 	projectId,
    // 	filesCount: Contents.length,
    // 	timestamp: new Date().toISOString(),
    // };
    return true;
  } catch (error) {
    console.error("Error in  pull code from bucket:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(errorMessage);

    // return {
    // 	success: false,
    // 	message: `Failed to pull code for project ${projectId}: ${errorMessage}`,
    // 	projectId,
    // 	error: errorMessage,
    // };
    return false;
  }
}

async function start() {
  console.log("Control POD is running...");
  await connectProducer();
  await connectConsumer();
  // await pullTemplateFromR2RenameItAsProject(); // this just pull code on start in prod
  await connectConsumerControlFromServe();

  await consumer.subscribe({
    topic: TOPIC.ORCHESTRATOR_TO_CONTROL,
  });

  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ message, partition, topic }) => {
      console.log(
        `Received message from topic: ${topic}, partition: ${partition}`,
        JSON.stringify(message),
      );
      const projectId = message.key?.toString();
      const value = message.value?.toString();

      if (!projectId || !value) {
        console.log("Skipping message: missing projectId or value");
        return;
      }

      console.log(`Processing message for project ${projectId}: ${value}`);

      switch (value) {
        case MESSAGE_KEYS.PROJECT_INITIALIZED:
          console.log(
            `[${new Date().toISOString()}] Initializing project ${projectId}`,
          );

          if (processing.has(projectId)) {
            console.log(
              `Project ${projectId} is already being processed, skipping`,
            );
            return;
          }

          try {
            console.log(`[${projectId}] Step 1: Pulling template from R2`);
            const templateResult =
              await pullTemplateFromR2RenameItAsProject(projectId);
            if (!templateResult) {
              throw new Error("Failed to pull template from R2");
            }

            console.log(
              `[${projectId}] Step 2: Pushing initialization to serving pod`,
            );
            await pushProjectInitializationToServingPod(projectId, producer);

            console.log(
              `[${projectId}] Step 3: Waiting for serving pod confirmation`,
            );
            await waitForProjectInitializationConfirmation(projectId);

            console.log(
              `[${new Date().toISOString()}] Successfully initialized project ${projectId}`,
            );
          } catch (error) {
            console.error(
              `[${new Date().toISOString()}] Failed to initialize project ${projectId}:`,
              error,
            );

            processing.delete(projectId);

            try {
              await producer.send({
                topic: TOPIC.SERVING_TO_ORCHESTRATOR,
                messages: [
                  { key: projectId, value: MESSAGE_KEYS.PROJECT_FAILED },
                ],
              });
              console.log(`Sent PROJECT_FAILED for ${projectId}`);
            } catch (sendError) {
              console.error(
                `Failed to send PROJECT_FAILED for ${projectId}:`,
                sendError,
              );
            }
          }
          break;

        case MESSAGE_KEYS.PROJECT_BUILD: {
          const buildSuccess = await buildProjectAndNotifyToRun(
            projectId,
            producer,
          );
          buildSuccess
            ? console.log(`Project ${projectId} built successfully.`)
            : console.log(`Project ${projectId} build failed.`);
          break;
        }

        default:
          if (value.startsWith("PROMPT|")) {
            const parts = value.split("|");
            if (parts.length < 2 || !parts[1]) {
              console.log(
                `Invalid prompt format for project ${projectId}: ${value}`,
              );
              break;
            }
            const prompt = parts[1].trim();
            console.log(
              `Processing prompt for project ${projectId}: ${prompt}`,
            );
            await processPrompt(projectId, prompt, producer);
            console.log("Agent processing started for project:", projectId);
          } else {
            console.log(
              `Received unknown message: ${value} for project: ${projectId} from ORCHESTRATOR_TO_CONTROL`,
            );
          }
          break;
      }
    },
  });

  await consumerControlFromServe.subscribe({
    topic: TOPIC.SERVING_TO_CONTROL,
    fromBeginning: false,
  });

  await consumerControlFromServe.run({
    eachMessage: async ({ message }) => {
      const projectId = message.key?.toString();
      const value = message.value?.toString();
      if (!value) return;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.log(
          `Failed to parse message: ${value} for project: ${projectId} from SERVING_TO_CONTROL`,
        );
        return;
      }
      switch (parsed.key) {
        case MESSAGE_KEYS.SERVING_PROJECT_INITIALIZATION_CONFIRMED:
          if (projectId) {
            const callback = processing.get(projectId);
            if (callback) {
              callback({ success: parsed.success, payload: parsed.payload });
              processing.delete(projectId);
            }
          }
          break;

        default:
          console.log(
            `Received unknown message: ${value} for project: ${projectId} from SERVING_TO_CONTROL`,
          );
          break;
      }
    },
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT. Shutting down...");
    await disconnectConsumer();
    await disconnectProducer();
    await disconnectConsumerControlFromServe();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM. Shutting down...");
    await disconnectConsumer();
    await disconnectProducer();
    await disconnectConsumerControlFromServe();
    process.exit(0);
  });
}

start().catch((error) => {
  console.error("Error starting Control POD:", error);
  process.exit(1);
});

startSSEServer();
