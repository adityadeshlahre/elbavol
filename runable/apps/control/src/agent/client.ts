import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
  model: "gemini-2.0-flash-lite",
  temperature: 0,
});
