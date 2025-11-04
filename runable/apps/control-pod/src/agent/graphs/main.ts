// LangGraph integration: The serve-pod functions are connected via Kafka messaging
// The control-pod triggers serving initialization when receiving PROJECT_INITIALIZED from orchestrator
// The serve-pod listens for PROJECT_INITIALIZED, PROJECT_BUILD, PROJECT_RUN on BETWEEN_PODS topic
// This connects the AI processing pipeline to the serving pipeline

export const mainGraph = null; // Placeholder for future LangGraph implementation

import { MemorySaver, Graph, InMemoryStore } from "@langchain/langgraph";
import { model } from "../client";
import {
	addDependency,
	buildSource,
	createFile,
	deleteFile,
	executeCommand,
	getContext,
	listDir,
	readFile,
	removeDependency,
	saveContext,
	testBuild,
	updateFile,
	validateBuild,
	writeMultipleFile,
} from "../tool";
import { enhancePrompt } from "../tool/code/enhancePrompt";
import { plannerPromptTool } from "../tool/code/plannerPrompt";
import { checkUserGivenPrompt } from "../tool/code/userGivenPromptChecker";
import { createAgent } from "langchain";

const memorySaver = new MemorySaver();

const store = new InMemoryStore();

export const graph = new Graph({ checkpointSaver: memorySaver });

export const agent = createAgent({
	model: model,
	tools: [
		addDependency,
		removeDependency,
		createFile,
		deleteFile,
		executeCommand,
		getContext,
		listDir,
		readFile,
		saveContext,
		testBuild,
		updateFile,
		writeMultipleFile,
		buildSource,
		enhancePrompt,
		plannerPromptTool,
		checkUserGivenPrompt,
		validateBuild,
	],
	store: store,
});

