import type { AgentState, ProjectContext, ToolExecution } from "@elbavol/types";
import { type BaseMessage, HumanMessage } from "@langchain/core/messages";

class StateManager {
  private states: Map<string, AgentState> = new Map();

  initializeState(projectId: string, initialPrompt: string): AgentState {
    const initialState: AgentState = {
      messages: [new HumanMessage(initialPrompt)],
      projectId,
      currentTask: initialPrompt,
      context: this.createEmptyContext(),
      toolExecutions: [],
      iteration: 0,
      status: "idle",
    };

    this.states.set(projectId, initialState);
    return initialState;
  }

  getState(projectId: string): AgentState | null {
    return this.states.get(projectId) || null;
  }

  updateState(projectId: string, updates: Partial<AgentState>): AgentState {
    const currentState = this.getState(projectId);
    if (!currentState) {
      throw new Error(`No state found for project ${projectId}`);
    }

    const newState = { ...currentState, ...updates };
    this.states.set(projectId, newState);
    return newState;
  }

  addMessage(projectId: string, message: BaseMessage): void {
    const state = this.getState(projectId);
    if (state) {
      state.messages.push(message);
      this.states.set(projectId, state);
    }
  }

  addToolExecution(projectId: string, execution: ToolExecution): void {
    const state = this.getState(projectId);
    if (state) {
      state.toolExecutions.push(execution);
      this.states.set(projectId, state);
    }
  }

  updateContext(projectId: string, context: Partial<ProjectContext>): void {
    const state = this.getState(projectId);
    if (state) {
      state.context = { ...state.context, ...context };
      this.states.set(projectId, state);
    }
  }

  incrementIteration(projectId: string): number {
    const state = this.getState(projectId);
    if (state) {
      state.iteration += 1;
      this.states.set(projectId, state);
      return state.iteration;
    }
    return 0;
  }

  setStatus(projectId: string, status: AgentState["status"]): void {
    this.updateState(projectId, { status });
  }

  createEmptyContext(): ProjectContext {
    return {
      fileStructure: {},
      dependencies: [],
      currentFiles: {},
      metadata: {
        lastModified: new Date().toISOString(),
        totalFiles: 0,
        buildStatus: "pending",
      },
    };
  }

  clearState(projectId: string): void {
    this.states.delete(projectId);
  }

  getAllStates(): Map<string, AgentState> {
    return new Map(this.states);
  }
}

export const stateManager = new StateManager();
