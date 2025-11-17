import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { GraphState } from "@/agent/graphs/main";

const smartAnalyzerInput = z.object({
    prompt: z.string().min(1, "Prompt is required"),
    projectId: z.string().min(1, "Project ID is required"),
    context: z.any().optional(),
});

export const smartAnalyzeAndPlan = tool(
    async (input: z.infer<typeof smartAnalyzerInput>) => {
        const { prompt, context } = smartAnalyzerInput.parse(input);

        const systemPrompt = `You are an expert AI assistant that analyzes user prompts and creates detailed execution plans for modifying existing React applications.

CRITICAL CONTEXT - READ THIS FIRST:
- A BASE TEMPLATE ALREADY EXISTS at SHARED_DIR/projectId
- The project is ALREADY SET UP with React 19, TypeScript, Bun, Tailwind CSS v4, and shadcn/ui
- DO NOT create a new React project (no create-react-app, no vite create, no npm init)
- DO NOT reinstall existing packages that are already in package.json
- DO NOT run npm/bun install unless adding NEW packages
- You MUST work on top of the EXISTING base template

BASE TEMPLATE INCLUDES:
✅ React 19 with TypeScript - ALREADY INSTALLED
✅ Bun runtime and package manager - ALREADY CONFIGURED
✅ Tailwind CSS v4 (latest) - ALREADY INSTALLED AND CONFIGURED
✅ shadcn/ui components - Button, Card, Input, Label, Select, Textarea - ALREADY AVAILABLE
✅ Lucide React icons - ALREADY INSTALLED
✅ Hot reload with bun --hot - ALREADY RUNNING
✅ Build system with build.ts - ALREADY CONFIGURED
✅ Utility functions: cn() in @/lib/utils - ALREADY AVAILABLE

EXISTING FILE STRUCTURE:
- package.json (with all dependencies)
- src/App.tsx (main app component)
- src/index.tsx or src/index.ts (entry point)
- src/index.css (Tailwind CSS configured)
- src/components/ (for custom components)
- src/components/ui/ (shadcn/ui components)
- src/lib/utils.ts (utility functions)
- build.ts (build script)
- tsconfig.json, bunfig.toml, components.json

YOUR WORKFLOW - FOLLOW THIS STRICTLY:
1. FIRST: Read existing files to understand current structure
   - ALWAYS start with: listDir, readFile for package.json, readFile for App.tsx
2. ANALYZE: Understand what's already there and what needs to change
3. PLAN: Create modifications based on existing structure
4. MODIFY: Use updateFile for existing files, createFile ONLY for new files
5. DO NOT: Create new project, reinstall existing packages, or ignore existing structure

Your task is to:
1. Analyze the prompt intent and complexity
2. Enhance the prompt if it's vague or needs clarification
3. Create a detailed, step-by-step execution plan that WORKS WITH the existing template
4. Generate specific tool calls that MODIFY the existing project

Return a JSON object with this exact structure:
{
  "analysis": {
    "intent": "creation|modification|debugging|validation|general",
    "complexity": "low|medium|high",
    "needsEnhancement": false,
    "requiredTools": ["tool1", "tool2"],
    "estimatedSteps": 5
  },
  "enhancedPrompt": "enhanced version of the prompt",
  "plan": "detailed step-by-step plan that works with existing template",
  "toolCalls": [
    {
      "tool": "listDir",
      "args": { "directory": "." }
    },
    {
      "tool": "readFile",
      "args": { "filePath": "package.json" }
    },
    {
      "tool": "readFile",
      "args": { "filePath": "src/App.tsx" }
    },
    {
      "tool": "updateFile",
      "args": { "filePath": "src/App.tsx", "content": "modified React component code" }
    }
  ]
}

Available tools and their arguments:
- listDir: { directory: string } - List existing directory structure
- readFile: { filePath: string } - Read existing file content
- updateFile: { filePath: string, content: string } - Modify existing file
- createFile: { filePath: string, content: string } - Create NEW file only
- deleteFile: { filePath: string } - Delete a file
- executeCommand: { command: string, cwd?: string } - Run shell commands
- addDependency: { packages: string[], cwd?: string } - Add NEW packages only
- removeDependency: { packages: string[], cwd?: string } - Remove packages
- checkMissingPackage: { packages: string[], cwd?: string } - Check if package exists
- writeMultipleFile: { files: [{ path: string, data: string }] } - Create/update multiple files
- getContext: { projectId: string } - Get project context
- saveContext: { context: object, filePath?: string } - Save context
- testBuild: { action: "build" | "test", cwd?: string } - Test the build
- validateBuild: { projectId: string, userInstructions: string } - Validate build
- pushFilesToR2: { projectId: string, bucketName: string } - Push to storage

MANDATORY FIRST STEPS IN EVERY PLAN:
1. listDir({ directory: "." }) - See what exists
2. readFile({ filePath: "package.json" }) - Check dependencies
3. readFile({ filePath: "src/App.tsx" }) - Understand current app

Then modify/add files based on what you found.

CRITICAL: Return ONLY valid JSON. Do NOT wrap in markdown code blocks or backticks. Just the raw JSON object.`;

        try {
            const contextInfo = context ? `

CURRENT PROJECT STATE:
${context.baseTemplate?.exists ? '✅ Base template EXISTS at: ' + context.projectPath : '❌ Base template NOT FOUND'}
${context.baseTemplate?.exists ? `
Installed Components: ${context.baseTemplate?.installedComponents?.join(', ') || 'Button, Card, Input, Label, Select, Textarea'}
Total Files: ${context.metadata?.totalFiles || 'Unknown'}
Dependencies: ${context.dependencies?.join(', ') || 'Loading...'}
` : ''}

Current Files Structure:
${context.fileStructure?.files ? context.fileStructure.files.slice(0, 20).join('\n') : 'Not loaded yet'}

Key Files Content:
${Object.keys(context.currentFiles || {}).map(file => `- ${file}: ${(context.currentFiles[file] || '').substring(0, 200)}...`).join('\n')}

` : 'Context not loaded yet - you MUST read files first!';

            const response = await model.invoke([
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: `User Request: ${prompt}${contextInfo}

Remember: 
1. The base template ALREADY EXISTS with React, TypeScript, Bun, Tailwind CSS v4, shadcn/ui
2. DO NOT create new project or reinstall existing packages
3. Start by reading existing files (listDir, readFile)
4. Modify existing files with updateFile, only use createFile for NEW files
5. Work on top of the existing template structure`,
                },
            ]);

            let result;
            try {
                const text = response.text.trim();

                // Try to extract JSON from markdown code blocks first
                let jsonText = text;
                const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    jsonText = codeBlockMatch[1];
                } else {
                    // Try to find JSON object in the response
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                    }
                }

                // Clean up common JSON issues
                jsonText = jsonText
                    .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
                    .replace(/\r/g, '')             // Remove carriage returns
                    .trim();

                result = JSON.parse(jsonText);

                // Validate result has required fields
                if (!result.analysis || !result.plan) {
                    throw new Error("Missing required fields in response");
                }

                // Ensure toolCalls exists, default to empty array
                if (!result.toolCalls) {
                    result.toolCalls = [];
                }

            } catch (parseError) {
                console.error("Failed to parse AI response:", parseError);
                console.error("AI response text:", response.text.substring(0, 500));

                // Fallback: Create a basic plan that reads existing template
                result = {
                    analysis: {
                        intent: "modification",
                        complexity: "medium",
                        needsEnhancement: false,
                        requiredTools: ["listDir", "readFile", "updateFile"],
                        estimatedSteps: 6
                    },
                    enhancedPrompt: prompt,
                    plan: `Based on the prompt: "${prompt}", modify the existing React template with the following steps:
1. List existing project structure to understand what's there
2. Read package.json to see installed dependencies
3. Read src/App.tsx to understand current app structure
4. Read other relevant files as needed
5. Modify/create components based on existing structure
6. Test the build`,
                    toolCalls: [
                        { tool: "listDir", args: { directory: "." } },
                        { tool: "listDir", args: { directory: "src" } },
                        { tool: "listDir", args: { directory: "src/components" } },
                        { tool: "readFile", args: { filePath: "package.json" } },
                        { tool: "readFile", args: { filePath: "src/App.tsx" } },
                        { tool: "readFile", args: { filePath: "src/index.css" } }
                    ]
                };
            }

            return {
                success: true,
                analysis: result.analysis,
                enhancedPrompt: result.enhancedPrompt || prompt,
                plan: result.plan,
                toolCalls: result.toolCalls || [],
            };
        } catch (error) {
            console.error("Error in smartAnalyzeAndPlan:", error);
            return {
                success: false,
                message: "Failed to analyze and plan",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    {
        name: "smartAnalyzeAndPlan",
        description: "Analyzes user prompt and creates a detailed execution plan in a single efficient step.",
        schema: smartAnalyzerInput,
    },
);

export async function smartAnalyzeAndPlanNode(state: GraphState): Promise<Partial<GraphState>> {
    sendSSEMessage(state.clientId, {
        type: "analyzing_and_planning",
        message: "Analyzing prompt and creating execution plan...",
    });

    const result = await smartAnalyzeAndPlan.invoke({
        prompt: state.prompt,
        projectId: state.projectId,
        context: state.context,
    });

    if (!result.success) {
        sendSSEMessage(state.clientId, {
            type: "analysis_error",
            message: "Failed to analyze and plan",
            error: result.error,
        });

        return {
            error: result.error || "Failed to analyze and plan",
            analysis: { intent: "general", complexity: "medium", needsEnhancement: false },
            enhancedPrompt: state.prompt,
            generatedPlan: "Create the requested application using available tools.",
        };
    }

    sendSSEMessage(state.clientId, {
        type: "planning_complete",
        message: `Plan created: ${result.analysis.estimatedSteps || 'multiple'} steps`,
        analysis: result.analysis,
    });

    return {
        analysis: result.analysis,
        enhancedPrompt: result.enhancedPrompt,
        generatedPlan: result.plan,
        toolCalls: result.toolCalls,
        accumulatedResponses: [`Analysis: ${result.analysis.intent} (${result.analysis.complexity} complexity)`, `Plan: ${result.plan}`],
    };
}
