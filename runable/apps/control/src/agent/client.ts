import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { VertexAI, ChatVertexAI, type ChatVertexAIInput, type VertexAIInput } from "@langchain/google-vertexai";

export const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
  model: "gemini-2.5-flash-lite",
  temperature: 0,
});
