import { InMemoryStore } from "@langchain/langgraph";

const embed = (texts: string[]): number[][] => {
  return texts.map(() => [Math.random(), Math.random()]);
};

export const store = new InMemoryStore({ index: { embed, dims: 2 } });

export async function getProjectMemories(projectId: string): Promise<any[]> {
  const namespace = [projectId, "memory"];
  try {
    const items = await store.search(namespace, {});
    return items.map(item => item.value);
  } catch (error) {
    console.error("Error retrieving memories:", error);
    return [];
  }
}

export async function saveProjectMemory(projectId: string, key: string, value: any): Promise<void> {
  const namespace = [projectId, "memory"];
  try {
    await store.put(namespace, key, value);
  } catch (error) {
    console.error("Error saving memory:", error);
  }
}

export async function saveConversationMemory(projectId: string, prompt: string, response: string): Promise<void> {
  const key = `conversation_${Date.now()}`;
  const value = {
    timestamp: new Date().toISOString(),
    prompt,
    response,
    type: "conversation"
  };
  await saveProjectMemory(projectId, key, value);
}