import { GROUP_ID, MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import "dotenv/config";
import { Kafka } from "kafkajs";
import http from "http";
import { parse } from "url";

const SSE_PORT = 3001;
const SSE_HOST = "0.0.0.0";

console.log("SSE POD started with env:", {
  NODE_ENV: process.env.NODE_ENV,
  PROJECT_ID: process.env.PROJECT_ID,
  BUCKET_NAME: process.env.BUCKET_NAME,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  SHARED_DIR: process.env.SHARED_DIR,
  KAFKA_URL: process.env.KAFKA_URL,
});

export const projectId = process.env.PROJECT_ID || "";
export const bucketName = process.env.BUCKET_NAME || "";

interface SSEClient {
  id: string;
  res: http.ServerResponse;
}

const clients = new Map<string, SSEClient>();

function startSSEServer() {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
      });
      res.end();
      return;
    }

    const { pathname, query } = parse(req.url || "", true);

    if (pathname === "/sse" && req.method === "GET") {
      const clientId = query.id as string;

      if (!clientId) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing client ID");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });

      res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

      const client: SSEClient = { id: clientId, res };
      clients.set(clientId, client);
      console.log(`[SSE] Client connected: ${clientId}`);

      req.on("close", () => {
        clients.delete(clientId);
        console.log(`[SSE] Client disconnected: ${clientId}`);
      });

      req.on("error", () => {
        clients.delete(clientId);
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  server.listen(SSE_PORT, SSE_HOST, () => {
    console.log(`[SSE] Server started on http://${SSE_HOST}:${SSE_PORT}`);
  });

  return server;
}

function sendSSEMessage(clientId: string, data: any): boolean {
  const client = clients.get(clientId);
  if (!client) {
    console.log(`[SSE] Client ${clientId} not found`);
    return false;
  }

  try {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error(`[SSE] Error sending to client ${clientId}:`, error);
    clients.delete(clientId);
    return false;
  }
}

const kafkaConfig = {
  clientId: `sse-pod-${Date.now()}`,
  brokers: (process.env.KAFKA_URL || "localhost:9092").split(","),
};

const kafka = new Kafka(kafkaConfig);

const consumer = kafka.consumer({
  groupId: GROUP_ID.SSE_POD,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  retry: {
    retries: 8,
  },
});

async function start() {
  console.log("[SSE] Starting SSE POD...");

  const server = startSSEServer();

  await consumer.connect();
  console.log("[SSE] Kafka consumer connected");

  await consumer.subscribe({
    topic: TOPIC.CONTROL_TO_SSE,
    fromBeginning: false,
  });

  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ message }) => {
      const projectId = message.key?.toString();
      const value = message.value?.toString();

      if (!projectId || !value) {
        console.log("[SSE] Skipping message: missing projectId or value");
        return;
      }

      console.log(`[SSE] Received event for project ${projectId}`);

      const sent = sendSSEMessage(projectId, { event: value });
      if (sent) {
        console.log(`[SSE] Event sent to client ${projectId}`);
      }
    },
  });

  const shutdown = async () => {
    console.log("[SSE] Shutting down...");
    await consumer.disconnect();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[SSE] Error starting SSE POD:", error);
  process.exit(1);
});
