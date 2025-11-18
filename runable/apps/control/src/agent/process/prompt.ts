import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import { randomUUID } from "crypto";
import type { Producer } from "kafkajs";
import { sendSSEMessage, getProjectSSEUrl } from "../../sse";
import { executeMainFlow } from "../flow/executor";
import { getProjectMemories, saveConversationMemory } from "../../memory";

export async function processPrompt(
  projectId: string,
  prompt: string,
  producer: Producer,
): Promise<void> {
  console.log(`Starting agent processing for project ${projectId}: ${prompt}`);

  const clientIdUsed = projectId;

  try {
    const memories = await getProjectMemories(projectId);
    const contextInfo = memories.length > 0 ? `Previous context: ${JSON.stringify(memories.slice(-5))}` : "";

    sendSSEMessage(clientIdUsed, {
      type: "started",
      message: "Processing prompt...",
    });

    await producer.send({
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value: MESSAGE_KEYS.PROMPT_RESPONSE + "|" + getProjectSSEUrl(clientIdUsed),
        },
      ],
    });
    console.log(`Sent SSE URL to orchestrator for project ${projectId}: ${getProjectSSEUrl(clientIdUsed)}`);

    let finalState;
    try {
      finalState = await executeMainFlow({
        projectId,
        prompt: prompt + (contextInfo ? `\n\n${contextInfo}` : ""),
        clientId: clientIdUsed,
        accumulatedResponses: [],
        completed: false,
        messages: [],
        threadId: projectId,
      });
    } catch (flowError) {
      console.error(`Flow execution error for project ${projectId}:`, flowError);
      sendSSEMessage(clientIdUsed, {
        type: "error",
        message: "Flow execution failed",
        error: flowError instanceof Error ? flowError.message : String(flowError),
      });
      return;
    }

    if (finalState.completed) {
      sendSSEMessage(clientIdUsed, {
        type: "completed",
        message: "Project updated successfully",
        result: finalState,
      });

      const aiResponse =
        finalState.accumulatedResponses?.join("\n\n") ||
        "No AI responses generated";

      await saveConversationMemory(projectId, prompt, aiResponse);

      await producer.send({
        topic: TOPIC.ORCHESTRATOR_TO_PRIME,
        messages: [{ key: projectId, value: `AI_RESPONSE: ${aiResponse}` }],
      });

      console.log(`Agent completed successfully for project ${projectId}`);

      if (finalState.context?.metadata?.buildStatus === "success") {
        await producer.send({
          topic: TOPIC.CONTROL_TO_SERVING,
          messages: [
            {
              key: projectId,
              value: JSON.stringify({
                key: MESSAGE_KEYS.PROJECT_RUN,
                projectId,
              }),
            },
          ],
        });
      }
    } else {
      sendSSEMessage(clientIdUsed, {
        type: "error",
        message: "Failed to complete the task",
        error: finalState.error,
      });

      console.error(`Agent failed for project ${projectId}:`, finalState.error);
    }
  } catch (error) {
    console.error(`Agent handler error for project ${projectId}:`, error);

    sendSSEMessage(clientIdUsed, {
      type: "error",
      message: "Unexpected error during processing",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
