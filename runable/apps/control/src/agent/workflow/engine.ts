import type { AgentResponse, AgentState, WorkflowConfig } from "@elbavol/types";
import { HumanMessage } from "@langchain/core/messages";
import { SYSTEM_PROMPTS } from "../../prompt/systemPrompt";
import { mainGraph } from "../graphs/main";
import { stateManager } from "../state/manager";

class WorkflowEngine {
  private defaultConfig: WorkflowConfig = {
    maxIterations: 10,
    timeoutMs: 300000,
    enableValidation: true,
    enableContextSaving: true,
  };

  async executePrompt(
    projectId: string,
    prompt: string,
    config: Partial<WorkflowConfig> = {},
  ): Promise<AgentResponse> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      let state = stateManager.getState(projectId);

      if (!state) {
        state = stateManager.initializeState(projectId, prompt);
      } else {
        stateManager.addMessage(projectId, new HumanMessage(prompt));
        stateManager.updateState(projectId, { currentTask: prompt });
      }

      stateManager.setStatus(projectId, "thinking");

      const result = await this.runAgentWorkflow(state, finalConfig);

      stateManager.setStatus(projectId, result.success ? "completed" : "error");

      return result;
    } catch (error) {
      stateManager.setStatus(projectId, "error");
      return {
        success: false,
        result: "",
        state: stateManager.getState(projectId)!,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
      };
    }
  }

  private async runAgentWorkflow(
    initialState: AgentState,
    config: WorkflowConfig,
  ): Promise<AgentResponse> {
    const { projectId } = initialState;

    try {
      const finalState = await mainGraph.invoke({
        projectId,
        prompt: initialState.currentTask,
        iterations: 0,
      });

      // Update stateManager with final status
      if (finalState.completed) {
        stateManager.setStatus(projectId, "completed");
      } else {
        stateManager.setStatus(projectId, "error");
      }

      if (finalState.completed) {
        return {
          success: true,
          result: "Project updated successfully",
          state: stateManager.getState(projectId)!,
          iterations: finalState.iterations,
        };
      } else {
        return {
          success: false,
          result: "Failed to complete the task",
          state: stateManager.getState(projectId)!,
          error: finalState.error || "Unknown error",
          iterations: finalState.iterations,
        };
      }
    } catch (error) {
      stateManager.setStatus(projectId, "error");
      return {
        success: false,
        result: "Maximum iterations reached without completion",
        state: stateManager.getState(projectId)!,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
      };
    }
  }

  private buildSystemPrompt(state: AgentState): string {
    const basePrompt = SYSTEM_PROMPTS.PROJECT_INITIALIZE_PROMPT;
    const contextInfo = this.buildContextInfo(state);

    return `${basePrompt}

CURRENT PROJECT CONTEXT:
${contextInfo}

USER REQUEST: ${state.currentTask}

Please execute this request using the available tools. Focus on the specific requirements and build exactly what the user has asked for.`;
  }

  private buildContextInfo(state: AgentState): string {
    const context = state.context;
    return `
Project ID: ${state.projectId}
Current Iteration: ${state.iteration}
Files Count: ${context.metadata.totalFiles}
Build Status: ${context.metadata.buildStatus}
Last Modified: ${context.metadata.lastModified}
Previous Tool Executions: ${state.toolExecutions.length}
`;
  }

  private isWorkComplete(content: string): boolean {
    const completionIndicators = [
      "task completed",
      "implementation finished",
      "work is done",
      "successfully created",
      "application is ready",
      "build successful",
    ];

    const lowerContent = content.toLowerCase();
    return completionIndicators.some((indicator) =>
      lowerContent.includes(indicator),
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getProjectStatus(projectId: string): Promise<AgentState | null> {
    return stateManager.getState(projectId);
  }

  async resetProject(projectId: string): Promise<void> {
    stateManager.clearState(projectId);
  }
}

export const workflowEngine = new WorkflowEngine();
