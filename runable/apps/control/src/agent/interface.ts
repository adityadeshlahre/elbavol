import { agentHandler } from "./index";
import type { Producer } from "kafkajs";

export class AgentInterface {
  async processUserPrompt(
    projectId: string,
    userPrompt: string,
    producer: Producer
  ): Promise<{
    success: boolean;
    message: string;
    projectId: string;
    processingStarted?: boolean;
  }> {
    try {
      if (!projectId || !userPrompt?.trim()) {
        return {
          success: false,
          message: "Invalid project ID or prompt",
          projectId: projectId || "unknown"
        };
      }

      if (agentHandler.isProjectProcessing(projectId)) {
        return {
          success: false,
          message: "Agent is already processing for this project",
          projectId,
          processingStarted: false
        };
      }

      agentHandler.handlePrompt(projectId, userPrompt.trim(), producer);

      return {
        success: true,
        message: "Agent processing started",
        projectId,
        processingStarted: true
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        projectId: projectId || "unknown"
      };
    }
  }

  async getProjectStatus(projectId: string) {
    try {
      const status = await agentHandler.getProjectStatus(projectId);
      
      return {
        success: true,
        projectId,
        ...status,
        summary: this.generateStatusSummary(status)
      };
    } catch (error) {
      return {
        success: false,
        projectId,
        error: error instanceof Error ? error.message : "Unknown error",
        isProcessing: false,
        hasState: false
      };
    }
  }

  async resetProject(projectId: string) {
    try {
      await agentHandler.resetProject(projectId);
      
      return {
        success: true,
        message: `Project ${projectId} reset successfully`,
        projectId
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to reset project",
        projectId
      };
    }
  }

  private generateStatusSummary(status: any): string {
    if (!status.hasState) {
      return "No active session";
    }

    if (status.isProcessing) {
      return `Processing (iteration ${status.state?.iteration || 0})`;
    }

    const state = status.state;
    if (state) {
      switch (state.status) {
        case "completed":
          return `Completed in ${state.iteration} iterations`;
        case "error":
          return "Failed with error";
        case "idle":
          return "Ready for next task";
        default:
          return `Status: ${state.status}`;
      }
    }

    return "Unknown status";
  }

  getAllProcessingProjects(): string[] {
    return agentHandler.getAllProcessingProjects();
  }
}

export const agentInterface = new AgentInterface();
