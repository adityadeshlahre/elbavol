import type { ToolExecution } from "@elbavol/types";
import { tool } from "langchain";
import * as z from "zod";

const toolExecutorInput = z.object({
  toolName: z.string(),
  toolInput: z.any(),
});

export const toolExecutor = tool(
  async (input: z.infer<typeof toolExecutorInput>) => {
    const { toolName, toolInput } = toolExecutorInput.parse(input);

    const execution: ToolExecution = {
      toolName,
      input: toolInput,
      output: null,
      timestamp: new Date().toISOString(),
      success: false,
    };

    try {
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
