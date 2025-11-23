"use client";

import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from "@/components/ui/ai/conversation";
import { Loader } from "@/components/ui/ai/loader";
import {
    Message,
    MessageAvatar,
    MessageContent,
} from "@/components/ui/ai/message";
import {
    PromptInput,
    PromptInputButton,
    PromptInputModelSelect,
    PromptInputModelSelectContent,
    PromptInputModelSelectItem,
    PromptInputModelSelectTrigger,
    PromptInputModelSelectValue,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputToolbar,
    PromptInputTools,
} from "@/components/ui/ai/prompt-input";
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from "@/components/ui/ai/reasoning";
import {
    Source,
    Sources,
    SourcesContent,
    SourcesTrigger,
} from "@/components/ui/ai/source";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MicIcon, PaperclipIcon, RotateCcwIcon } from "lucide-react";
import { type FormEventHandler, useCallback, useEffect, useState } from "react";
type ChatMessage = {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
    reasoning?: string;
    sources?: Array<{ title: string; url: string }>;
    isStreaming?: boolean;
};
const models = [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    { id: "llama-3.1-70b", name: "Llama 3.1 70B" },
];
const sampleResponses = [
    {
        content:
            "I'd be happy to help you with that! React is a powerful JavaScript library for building user interfaces. What specific aspect would you like to explore?",
        reasoning:
            "The user is asking about React, which is a broad topic. I should provide a helpful overview while asking for more specific information to give a more targeted response.",
        sources: [
            { title: "React Official Documentation", url: "https://react.dev" },
            { title: "React Developer Tools", url: "https://react.dev/learn" },
        ],
    },
    {
        content:
            "Next.js is an excellent framework built on top of React that provides server-side rendering, static site generation, and many other powerful features out of the box.",
        reasoning:
            "The user mentioned Next.js, so I should explain its relationship to React and highlight its key benefits for modern web development.",
        sources: [
            { title: "Next.js Documentation", url: "https://nextjs.org/docs" },
            {
                title: "Vercel Next.js Guide",
                url: "https://vercel.com/guides/nextjs",
            },
        ],
    },
    {
        content:
            "TypeScript adds static type checking to JavaScript, which helps catch errors early and improves code quality. It's particularly valuable in larger applications.",
        reasoning:
            "TypeScript is becoming increasingly important in modern development. I should explain its benefits while keeping the explanation accessible.",
        sources: [
            {
                title: "TypeScript Handbook",
                url: "https://www.typescriptlang.org/docs",
            },
            {
                title: "TypeScript with React",
                url: "https://react.dev/learn/typescript",
            },
        ],
    },
];
const Chat = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: Bun.randomUUIDv7(),
            content:
                "Hello! I'm your AI assistant. I can help you with coding questions, explain concepts, and provide guidance on web development topics. What would you like to know?",
            role: "assistant",
            timestamp: new Date(),
            sources: [
                { title: "Getting Started Guide", url: "#" },
                { title: "API Documentation", url: "#" },
            ],
        },
    ]);

    const [inputValue, setInputValue] = useState("");
    const [selectedModel, setSelectedModel] = useState(models[0].id);
    const [isTyping, setIsTyping] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
        null,
    );

    const simulateTyping = useCallback(
        (
            messageId: string,
            content: string,
            reasoning?: string,
            sources?: Array<{ title: string; url: string }>,
        ) => {
            let currentIndex = 0;
            const typeInterval = setInterval(() => {
                setMessages((prev) =>
                    prev.map((msg) => {
                        if (msg.id === messageId) {
                            const currentContent = content.slice(0, currentIndex);
                            return {
                                ...msg,
                                content: currentContent,
                                isStreaming: currentIndex < content.length,
                                reasoning:
                                    currentIndex >= content.length ? reasoning : undefined,
                                sources: currentIndex >= content.length ? sources : undefined,
                            };
                        }
                        return msg;
                    }),
                );
                currentIndex += Math.random() > 0.1 ? 1 : 0; // Simulate variable typing speed

                if (currentIndex >= content.length) {
                    clearInterval(typeInterval);
                    setIsTyping(false);
                    setStreamingMessageId(null);
                }
            }, 50);
            return () => clearInterval(typeInterval);
        },
        [],
    );
    const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
        (event) => {
            event.preventDefault();

            if (!inputValue.trim() || isTyping) return;
            // Add user message
            const userMessage: ChatMessage = {
                id: Bun.randomUUIDv7(),
                content: inputValue.trim(),
                role: "user",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMessage]);
            setInputValue("");
            setIsTyping(true);
            // Simulate AI response with delay
            setTimeout(() => {
                const responseData =
                    sampleResponses[Math.floor(Math.random() * sampleResponses.length)];
                const assistantMessageId = Bun.randomUUIDv7();

                const assistantMessage: ChatMessage = {
                    id: assistantMessageId,
                    content: "",
                    role: "assistant",
                    timestamp: new Date(),
                    isStreaming: true,
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingMessageId(assistantMessageId);

                // Start typing simulation
                simulateTyping(
                    assistantMessageId,
                    responseData.content,
                    responseData.reasoning,
                    responseData.sources,
                );
            }, 800);
        },
        [inputValue, isTyping, simulateTyping],
    );
    const handleReset = useCallback(() => {
        setMessages([
            {
                id: Bun.randomUUIDv7(),
                content:
                    "Hello! I'm your AI assistant. I can help you with coding questions, explain concepts, and provide guidance on web development topics. What would you like to know?",
                role: "assistant",
                timestamp: new Date(),
                sources: [
                    { title: "Getting Started Guide", url: "#" },
                    { title: "API Documentation", url: "#" },
                ],
            },
        ]);
        setInputValue("");
        setIsTyping(false);
        setStreamingMessageId(null);
    }, []);
    return (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-green-500" />
                        <span className="font-medium text-sm">AI Assistant</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-muted-foreground text-xs">
                        {models.find((m) => m.id === selectedModel)?.name}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-8 px-2"
                >
                    <RotateCcwIcon className="size-4" />
                    <span className="ml-1">Reset</span>
                </Button>
            </div>
            {/* Conversation Area */}
            <Conversation className="flex-1">
                <ConversationContent className="space-y-4">
                    {messages.map((message) => (
                        <div key={message.id} className="space-y-3">
                            <Message from={message.role}>
                                <MessageContent>
                                    {message.isStreaming && message.content === "" ? (
                                        <div className="flex items-center gap-2">
                                            <Loader size={14} />
                                            <span className="text-muted-foreground text-sm">
                                                Thinking...
                                            </span>
                                        </div>
                                    ) : (
                                        message.content
                                    )}
                                </MessageContent>
                                <MessageAvatar
                                    src={
                                        message.role === "user"
                                            ? "https://github.com/dovazencot.png"
                                            : "https://github.com/vercel.png"
                                    }
                                    name={message.role === "user" ? "User" : "AI"}
                                />
                            </Message>
                            {/* Reasoning */}
                            {message.reasoning && (
                                <div className="ml-10">
                                    <Reasoning
                                        isStreaming={message.isStreaming}
                                        defaultOpen={false}
                                    >
                                        <ReasoningTrigger />
                                        <ReasoningContent>{message.reasoning}</ReasoningContent>
                                    </Reasoning>
                                </div>
                            )}
                            {/* Sources */}
                            {message.sources && message.sources.length > 0 && (
                                <div className="ml-10">
                                    <Sources>
                                        <SourcesTrigger count={message.sources.length} />
                                        <SourcesContent>
                                            {message.sources.map((source, index) => (
                                                <Source
                                                    key={index}
                                                    href={source.url}
                                                    title={source.title}
                                                />
                                            ))}
                                        </SourcesContent>
                                    </Sources>
                                </div>
                            )}
                        </div>
                    ))}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>
            {/* Input Area */}
            <div className="border-t p-4">
                <PromptInput onSubmit={handleSubmit}>
                    <PromptInputTextarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask me anything about development, coding, or technology..."
                        disabled={isTyping}
                    />
                    <PromptInputToolbar>
                        <PromptInputTools>
                            <PromptInputButton disabled={isTyping}>
                                <PaperclipIcon size={16} />
                            </PromptInputButton>
                            <PromptInputButton disabled={isTyping}>
                                <MicIcon size={16} />
                                <span>Voice</span>
                            </PromptInputButton>
                            <PromptInputModelSelect
                                value={selectedModel}
                                onValueChange={setSelectedModel}
                                disabled={isTyping}
                            >
                                <PromptInputModelSelectTrigger>
                                    <PromptInputModelSelectValue />
                                </PromptInputModelSelectTrigger>
                                <PromptInputModelSelectContent>
                                    {models.map((model) => (
                                        <PromptInputModelSelectItem key={model.id} value={model.id}>
                                            {model.name}
                                        </PromptInputModelSelectItem>
                                    ))}
                                </PromptInputModelSelectContent>
                            </PromptInputModelSelect>
                        </PromptInputTools>
                        <PromptInputSubmit
                            disabled={!inputValue.trim() || isTyping}
                            status={isTyping ? "streaming" : "ready"}
                        />
                    </PromptInputToolbar>
                </PromptInput>
            </div>
        </div>
    );
};

export default Chat;
