import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { allTools } from "./graphs/main";

export const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
  model: "gemini-2.0-flash-lite",
  temperature: 0,
});

export const checkpointer = new MemorySaver();

export const agent = createAgent({
  model,
  tools: allTools,
  checkpointer,
})