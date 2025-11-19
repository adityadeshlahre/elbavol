import type { WorkflowState } from "@/agent/graphs/workflow";
import { sendSSEMessage } from "@/sse";
import fs from "fs";
import { tool } from "langchain";
import path from "path";
import * as z from "zod";

const saveContextInput = z.object({
  context: z.any(),
  filePath: z.string().optional().default("context.json"),
});

export const saveContext = tool(
  async (input: z.infer<typeof saveContextInput>) => {
    const { context, filePath } = saveContextInput.parse(input);
    const fullPath = path.resolve("/app/shared", filePath);

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(context, null, 2), "utf8");
      return { success: true, message: `Context saved to ${filePath}` };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save context: ${(error as Error).message}`,
      };
    }
  },
  {
    name: "saveContext",
    description: "Saves context data to a file.",
    schema: saveContextInput,
  },
);

export async function saveNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  sendSSEMessage(state.clientId, {
    type: "saving",
    message: "Saving context...",
  });

  await saveContext.invoke({
    context: state.context,
    filePath: `${state.projectId}/context.json`,
  });

  sendSSEMessage(state.clientId, {
    type: "completed",
    message: "Context saved successfully",
  });

  return {};
}
