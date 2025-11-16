import { MESSAGE_KEYS, TOPIC } from "@elbavol/constants";
import { randomUUID } from "crypto";
import type { Producer } from "kafkajs";
import { sendSSEMessage, startSSEServer } from "../sse";
import { mainGraph } from "./graphs/main";

export async function processPrompt(
  projectId: string,
  prompt: string,
  producer: Producer,
  clientId?: string,
): Promise<void> {
  console.log(`Starting agent processing for project ${projectId}: ${prompt}`);

  try {
    startSSEServer();

    const clientIdUsed = clientId || randomUUID();
    sendSSEMessage(clientIdUsed, {
      type: "started",
      message: "Processing prompt...",
    });

    let finalState;
    try {
      finalState = await mainGraph.invoke({
        projectId,
        prompt: prompt,
        iterations: 0,
        clientId: clientIdUsed,
        accumulatedResponses: [],
      }, { configurable: { thread_id: projectId } });
    } catch (graphError) {
      console.error(`Graph execution error for project ${projectId}:`, graphError);
      sendSSEMessage(clientIdUsed, {
        type: "error",
        message: "Graph execution failed",
        error: graphError instanceof Error ? graphError.message : String(graphError),
      });

      await producer.send({
        topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
        messages: [
          {
            key: projectId,
            value:
              MESSAGE_KEYS.PROMPT_RESPONSE +
              "|" +
              (graphError instanceof Error ? graphError.message : String(graphError)),
          },
        ],
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
      await producer.send({
        topic: TOPIC.ORCHESTRATOR_TO_PRIME,
        messages: [{ key: projectId, value: `AI_RESPONSE: ${aiResponse}` }],
      });

      console.log(`Agent completed successfully for project ${projectId}`);

      await producer.send({
        topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
        messages: [
          {
            key: projectId,
            value: MESSAGE_KEYS.PROMPT_RESPONSE + "|" + clientIdUsed,
          },
        ],
      });

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

      await producer.send({
        topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
        messages: [
          {
            key: projectId,
            value:
              MESSAGE_KEYS.PROMPT_RESPONSE +
              "|" +
              (finalState.error || "Unknown error"),
          },
        ],
      });
    }
  } catch (error) {
    console.error(`Agent handler error for project ${projectId}:`, error);

    await producer.send({
      topic: TOPIC.CONTROL_TO_ORCHESTRATOR,
      messages: [
        {
          key: projectId,
          value:
            MESSAGE_KEYS.PROMPT_RESPONSE +
            "|" +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    });
  }
}
