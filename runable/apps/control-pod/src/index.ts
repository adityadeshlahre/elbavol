import { GROUP_ID, TOPIC } from "@elbavol/constants";
import "dotenv/config";
import { Kafka } from "kafkajs";
import { pushProjectInitializationToServingPod } from "./classes/project";

console.log("Global POD started with env:", {
	NODE_ENV: process.env.NODE_ENV,
	CORS_ORIGIN: process.env.CORS_ORIGIN,
});

export const processing = new Map<
	string,
	(value: { success: boolean; payload?: string }) => void
>();

const kafkaConfig = {
	clientId: "control-pod",
	brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
};

const kafka = new Kafka(kafkaConfig);

export const producer = kafka.producer();

export const consumer = kafka.consumer({ groupId: GROUP_ID.CONTROL_POD });

export const consumerBetweenPods = kafka.consumer({
	groupId: GROUP_ID.BETWEEN_PODS,
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
	console.log("Control POD is running...");
	await connectProducer();
	await connectConsumer();

	await consumer.subscribe({
		topic: TOPIC.ORCHESTRATOR_TO_CONTROL,
		fromBeginning: true,
	});

	await consumer.run({
		eachMessage: async ({ topic, partition, message }) => {
			const projectId = message.key?.toString();
			const value = message.value?.toString();

			switch (value) {
				case TOPIC.PROJECT_INITIALIZED:
					if (projectId) {
						console.log(`Initializing project ${projectId}`);
						await pushProjectInitializationToServingPod(projectId, producer);
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

	await consumerBetweenPods.subscribe({
		topic: TOPIC.BETWEEN_PODS,
		fromBeginning: true,
	});

	await consumerBetweenPods.run({
		eachMessage: async ({ topic, partition, message }) => {
			const projectId = message.key?.toString();
			const value = message.value?.toString();
			switch (value) {
				case TOPIC.BETWEEN_PODS:
					if (projectId) {
						const callback = processing.get(projectId);
						if (callback) {
							callback({ success: true, payload: message.value?.toString() });
							processing.delete(projectId);
						}
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

	process.on("SIGINT", async () => {
		console.log("Received SIGINT. Shutting down...");
		await disconnectConsumer();
		await disconnectProducer();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		console.log("Received SIGTERM. Shutting down...");
		await disconnectConsumer();
		await disconnectProducer();
		process.exit(0);
	});
}

start().catch((error) => {
	console.error("Error starting Control POD:", error);
	process.exit(1);
});

