import { promptAnalyzer } from "../tool/analysis/promptAnalyzer";
import { buildSource } from "../tool/code/buildSource";
import { checkUserGivenPrompt } from "../tool/code/userGivenPromptChecker";
import { validateBuild } from "../tool/code/validateBuild";
import { addDependency, removeDependency } from "../tool/dry/addAndRemoveDependency";
import { checkMissingPackage } from "../tool/dry/checkMissingPackage";
import { createFile } from "../tool/dry/createFile";
import { deleteFile } from "../tool/dry/deleteFile";
import { executeCommand } from "../tool/dry/executeCommand";
import { getContext } from "../tool/dry/getContext";
import { listDir } from "../tool/dry/listDir";
import { readFile } from "../tool/dry/readFile";
import { saveContext } from "../tool/dry/saveContext";
import { testBuild } from "../tool/dry/testBuild";
import { updateFile } from "../tool/dry/updateFile";
import { writeMultipleFile } from "../tool/dry/writeMultipleFile";
import { pushFilesToR2 } from "../tool/r2/push";

export const allTools = [
  promptAnalyzer,
  buildSource,
  checkUserGivenPrompt,
  validateBuild,
  addDependency,
  removeDependency,
  checkMissingPackage,
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
  pushFilesToR2,
];

export interface GraphState {
  projectId: string;
  prompt: string;
  analysis?: any;
  enhancedPrompt?: string;
  generatedPlan?: string;
  toolCalls?: any[];
  context?: any;
  toolResults?: any[];
  buildStatus?: string;
  buildErrors?: any[];
  errorAnalysis?: any;
  progressTracking?: any;
  completed: boolean;
  error?: string;
  pushResult?: any;
  clientId: string;
  accumulatedResponses: string[];
  messages?: Array<{ role: string; content: string }>;
  threadId?: string;
}
