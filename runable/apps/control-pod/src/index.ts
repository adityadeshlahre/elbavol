import { GROUP_ID } from "@elbavol/constants";
import "dotenv/config";
import { Kafka } from "kafkajs";

console.log("Global POD started with env:", {
	NODE_ENV: process.env.NODE_ENV,
	CORS_ORIGIN: process.env.CORS_ORIGIN,
});

export const processing = new Map<string, (value: {
	success: boolean
	payload?: string
}) => void>();

const kafkaConfig = {
	clientId: "control-pod",
	brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
}

const kafka = new Kafka(kafkaConfig);

export const producer = kafka.producer();

export const consumer = kafka.consumer({ groupId: GROUP_ID.SERVING_POD });

async function connectProducer() {
	try {
		await producer.connect();
		console.log('Kafka Producer connected.');
	} catch (error) {
		console.error('Failed to connect Kafka Producer:', error);
	}
}

async function connectConsumer() {
	try {
		await consumer.connect();
		console.log('Kafka Consumer connected.');
	} catch (error) {
		console.error('Failed to connect Kafka Consumer:', error);
	}
}

async function disconnectProducer() {
	try {
		await producer.disconnect();
		console.log('Kafka Producer disconnected.');
	} catch (error) {
		console.error('Failed to disconnect Kafka Producer:', error);
	}
}

async function disconnectConsumer() {
	try {
		await consumer.disconnect();
		console.log('Kafka Consumer disconnected.');
	} catch (error) {
		console.error('Failed to disconnect Kafka Consumer:', error);
	}
}



async function start() {
	console.log("Control POD is running...");
	await connectProducer();
	await connectConsumer();

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