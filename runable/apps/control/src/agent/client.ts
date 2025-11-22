import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MemorySaver } from "@langchain/langgraph";

class LLMClient {
  private static instance: LLMClient;
  private _model: ChatGoogleGenerativeAI;
  private _checkpointer: MemorySaver;

  private constructor() {
    this._model = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY || "",
      model: "gemini-2.0-flash-lite",
      temperature: 1.2,
    });
    this._checkpointer = new MemorySaver();
  }

  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
  }

  public get model(): ChatGoogleGenerativeAI {
    return this._model;
  }

  public get checkpointer(): MemorySaver {
    return this._checkpointer;
  }
}

export const llmClient = LLMClient.getInstance();

export const model = llmClient.model;

export const checkpointer = llmClient.checkpointer;