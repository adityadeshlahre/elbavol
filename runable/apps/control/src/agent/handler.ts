import { workflowEngine } from "./workflow/engine";
import { stateManager } from "./state/manager";
import type { Producer } from "kafkajs";
import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";

export class AgentHandler {
  private processingMap: Map<string, boolean> = new Map();

  async handlePrompt(
    projectId: string, 
    prompt: string, 
    producer: Producer
  ): Promise<void> {
    if (this.processingMap.get(projectId)) {
      console.log(`Agent already processing for project ${projectId}`);
      return;
    }

    this.processingMap.set(projectId, true);

    try {
      console.log(`Starting agent processing for project ${projectId}: ${prompt}`);
      
      const response = await workflowEngine.executePrompt(projectId, prompt, {
        maxIterations: 8,
        timeoutMs: 240000,
        enableValidation: true,
        enableContextSaving: true
      });

      if (response.success) {
        console.log(`Agent completed successfully for project ${projectId}`);
        
        await producer.send({
          topic: TOPIC.SERVING_TO_CONTROL, // maybe wrong here
          messages: [{
            key: projectId,
            value: JSON.stringify({
              type: "AGENT_COMPLETED",
              result: response.result,
              iterations: response.iterations,
              timestamp: new Date().toISOString()
            })
          }]
        });

        await this.notifyCompletion(projectId, response.result, producer);
        
      } else {
        console.error(`Agent failed for project ${projectId}:`, response.error);
        
        await producer.send({
          topic: TOPIC.SERVING_TO_CONTROL, // maybe wrong here
          messages: [{
            key: projectId,
            value: JSON.stringify({
              type: "AGENT_FAILED",
              error: response.error,
              iterations: response.iterations,
              timestamp: new Date().toISOString()
            })
          }]
        });
      }

    } catch (error) {
      console.error(`Agent handler error for project ${projectId}:`, error);
      
      await producer.send({
        topic: TOPIC.SERVING_TO_CONTROL, // maybe wrong here
        messages: [{
          key: projectId,
          value: JSON.stringify({
            type: "AGENT_ERROR",
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          })
        }]
      });
      
    } finally {
      this.processingMap.set(projectId, false);
    }
  }

  async getProjectStatus(projectId: string) {
    const state = await workflowEngine.getProjectStatus(projectId);
    const isProcessing = this.processingMap.get(projectId) || false;
    
    return {
      state,
      isProcessing,
      hasState: !!state
    };
  }

  async resetProject(projectId: string): Promise<void> {
    await workflowEngine.resetProject(projectId);
    this.processingMap.delete(projectId);
  }

  private async notifyCompletion(
    projectId: string, 
    _result: string, 
    producer: Producer
  ): Promise<void> {
    try {
      const state = stateManager.getState(projectId);
      
      if (state && state.context.metadata.buildStatus === "success") {
        await producer.send({
          topic: TOPIC.CONTROL_TO_SERVING,
          messages: [{
            key: projectId,
            value: MESSAGE_KEYS.PROJECT_BUILD
          }]
        });
      }
      
    } catch (error) {
      console.error(`Failed to notify completion for project ${projectId}:`, error);
    }
  }

  isProjectProcessing(projectId: string): boolean {
    return this.processingMap.get(projectId) || false;
  }

  getAllProcessingProjects(): string[] {
    return Array.from(this.processingMap.entries())
      .filter(([_, isProcessing]) => isProcessing)
      .map(([projectId, _]) => projectId);
  }
}

export const agentHandler = new AgentHandler();
