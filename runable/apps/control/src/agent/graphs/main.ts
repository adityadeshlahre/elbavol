import { InMemoryStore } from "@langchain/langgraph";
import { createAgent } from "langchain";
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
import { promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { enhancePrompt } from "../tool/code/enhancePrompt";
import { plannerPromptTool } from "../tool/code/plannerPrompt";
import { checkUserGivenPrompt } from "../tool/code/userGivenPromptChecker";
import { contextManager, toolExecutor } from "../workflow/tools";

const store = new InMemoryStore();

const tools = [
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
  toolExecutor,
  contextManager,
  promptAnalyzer,
];

export const agent = createAgent({
  model: model,
  tools: tools,
  store: store,
});
