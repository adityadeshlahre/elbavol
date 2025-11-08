import type { ToolExecution } from "@elbavol/types";
import { tool } from "langchain";
import * as z from "zod";
import { stateManager } from "../state/manager";

const toolExecutorInput = z.object({
  projectId: z.string(),
  toolName: z.string(),
  toolInput: z.any(),
});

export const toolExecutor = tool(
  async (input: z.infer<typeof toolExecutorInput>) => {
    const { projectId, toolName, toolInput } = toolExecutorInput.parse(input);

    const execution: ToolExecution = {
      toolName,
      input: toolInput,
      output: null,
      timestamp: new Date().toISOString(),
      success: false,
    };

    try {
      stateManager.addToolExecution(projectId, execution);

      execution.output = `Tool ${toolName} executed with input: ${JSON.stringify(toolInput)}`;
      execution.success = true;

      return {
        success: true,
        toolName,
        output: execution.output,
        timestamp: execution.timestamp,
      };
    } catch (error) {
      execution.error = error instanceof Error ? error.message : String(error);
      execution.success = false;

      return {
        success: false,
        toolName,
        error: execution.error,
        timestamp: execution.timestamp,
      };
    }
  },
  {
    name: "toolExecutor",
    description:
      "Executes tools and tracks their execution for project state management.",
    schema: toolExecutorInput,
  },
);

const contextManagerInput = z.object({
  projectId: z.string(),
  action: z.enum(["load", "save", "update"]),
  data: z.any().optional(),
});

export const contextManager = tool(
  async (input: z.infer<typeof contextManagerInput>) => {
    const { projectId, action, data } = contextManagerInput.parse(input);

    try {
      const state = stateManager.getState(projectId);

      if (!state) {
        return {
          success: false,
          error: `No state found for project ${projectId}`,
        };
      }

      switch (action) {
        case "load":
          return {
            success: true,
            context: state.context,
            messages: state.messages.length,
            toolExecutions: state.toolExecutions.length,
            iteration: state.iteration,
            status: state.status,
          };

        case "save":
          if (data) {
            stateManager.updateContext(projectId, data);
          }
          return {
            success: true,
            message: "Context saved successfully",
          };

        case "update":
          if (data) {
            stateManager.updateState(projectId, data);
          }
          return {
            success: true,
            message: "State updated successfully",
          };

        default:
          return {
            success: false,
            error: "Invalid action specified",
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    name: "contextManager",
    description: "Manages project context and state across agent iterations.",
    schema: contextManagerInput,
  },
);
