import { tool } from "langchain";
import * as z from "zod";
import { model } from "@/agent/client";
import { sendSSEMessage } from "@/sse";
import type { WorkflowState } from "@/agent/graphs/workflow";

const smartAnalyzerInput = z.object({
    prompt: z.string().min(1, "Prompt is required"),
    projectId: z.string().min(1, "Project ID is required"),
    context: z.any().optional(),
});

export const smartAnalyzeAndPlan = tool(
    async (input: z.infer<typeof smartAnalyzerInput>) => {
        const { prompt, context } = smartAnalyzerInput.parse(input);

        const systemPrompt = `You are an expert AI assistant that analyzes user prompts and creates detailed execution plans for modifying existing React applications. Focus on creating BEAUTIFUL, modern UIs with proper planning.

CRITICAL CONTEXT - READ THIS FIRST:
- A BASE TEMPLATE ALREADY EXISTS at SHARED_DIR/projectId
- The project is ALREADY SET UP with React 19, JavaScript, Bun, Tailwind CSS v4, and shadcn/ui
- DO NOT create a new React project (no create-react-app, no vite create, no npm init)
- DO NOT reinstall existing packages that are already in package.json
- DO NOT run npm/bun install unless adding NEW packages
- You MUST work on top of the EXISTING base template

BASE TEMPLATE INCLUDES:
✅ React 19 with JavaScript - ALREADY INSTALLED
✅ Bun runtime and package manager - ALREADY CONFIGURED
✅ Tailwind CSS v4 (latest) - ALREADY INSTALLED AND CONFIGURED
✅ shadcn/ui components - Button, Card, Input, Label, Textarea - ALREADY AVAILABLE
✅ Lucide React icons - ALREADY INSTALLED
✅ For new shadcn components: Use \`bunx --bun shadcn@latest add <component-name>\` from https://ui.shadcn.com/docs/components
✅ Hot reload with bun --hot - ALREADY RUNNING
✅ Build system with build.js - ALREADY CONFIGURED
✅ Utility functions: cn() in @/lib/utils - ALREADY AVAILABLE

EXISTING FILE STRUCTURE:
- package.json (with all dependencies)
- src/App.jsx (main app component)
- src/index.jsx or src/index.js (entry point)
- src/index.css (Tailwind CSS configured)
- src/components/ (for custom components)
- src/components/ui/ (shadcn/ui components)
- src/lib/utils.js (utility functions)
- build.js (build script)
- bunfig.toml, components.json

YOUR WORKFLOW - FOLLOW THIS STRICTLY:
1. FIRST: Read existing files to understand current structure
   - ALWAYS start with: listDir, readFile for package.json, readFile for App.tsx
2. ANALYZE: Understand what's already there and what needs to change
3. PLAN BEAUTIFUL UI: Include gradients, shadows, animations, hover effects, and modern design in all components
3. PLAN: Create modifications based on existing structure
4. MODIFY: Use updateFile for existing files, createFile ONLY for new files
5. DO NOT: Create new project, reinstall existing packages, or ignore existing structure

OPTIMIZATION & STRUCTURE RULES:
1. **Distributed Components**: Break down large components into smaller, reusable sub-components.
2. **Better Folder Structure**:
   - \`src/features/\`: For domain-specific features (e.g., \`src/features/auth\`, \`src/features/dashboard\`)
   - \`src/layouts/\`: For page layouts (e.g., \`src/layouts/MainLayout.jsx\`)
   - \`src/pages/\`: For route components
   - \`src/hooks/\`: For custom hooks
   - \`src/utils/\`: For helper functions
3. **Token Usage**: Be concise in your plans. Do not output unnecessary text.
4. **Batch Operations**: Use \`writeMultipleFile\` when creating multiple files to reduce tool call overhead.

Your task is to:
1. Analyze the prompt intent (creation, modification, debugging, etc.)
2. Assess complexity level (low, medium, high)
3. Identify required tools for this task
4. Estimate number of steps needed

Return a JSON object with this exact structure:
{
  "analysis": {
    "intent": "creation|modification|debugging|validation|general",
    "complexity": "low|medium|high",
    "requiredTools": ["tool1", "tool2"],
    "estimatedSteps": 5
  }
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
2. listDir({ directory: "src/components/ui" }) - Check available UI components
3. listDir({ directory: "src/components/" }) - Check available components
4. readFile({ filePath: "package.json" }) - Check dependencies
5. readFile({ filePath: "src/App.jsx" }) - Understand current app

Then modify/add files based on what you found.

BEAUTIFUL UI DESIGN REQUIREMENTS:
- Use Tailwind CSS for stunning visuals: gradients (bg-gradient-to-r from-blue-500 to-purple-600), shadows (shadow-2xl), animations (animate-pulse), hover effects (hover:scale-105)
- Prefer existing shadcn/ui components (Button, Card, Input, Label, Textarea) over custom ones
- Add Lucide icons for better UX
- Create responsive, modern designs with proper spacing and colors
- For new components: \`bunx --bun shadcn@latest add <component-name>\` if needed from https://ui.shadcn.com/docs/components

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
1. The base template ALREADY EXISTS with React, JavaScript, Bun, Tailwind CSS v4, shadcn/ui
2. DO NOT create new project or reinstall existing packages
3. Start by reading existing files (listDir, readFile)
4. Modify existing files with updateFile, only use createFile for NEW files
5. Work on top of the existing template structure`,
                },
            ]);

            let result;
            try {
                const text = response.text.trim();

                let jsonText = text;
                const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    jsonText = codeBlockMatch[1];
                } else {
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        jsonText = jsonMatch[0];
                    }
                }

                jsonText = jsonText
                    .replace(/,(\s*[\]}])/g, '$1')
                    .replace(/\r/g, '')
                    .trim();

                result = JSON.parse(jsonText);

                if (!result.analysis) {
                    throw new Error("Missing analysis field in response");
                }

            } catch (parseError) {
                console.error("Failed to parse AI response:", parseError);
                console.error("AI response text:", response.text.substring(0, 500));
                throw new Error("Failed to analyze prompt: Invalid LLM response");
            }

            return {
                success: true,
                analysis: result.analysis,
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

export async function analyzeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    sendSSEMessage(state.clientId, {
        type: "analyzing",
        message: "Analyzing prompt intent and complexity...",
    });

    const result = await smartAnalyzeAndPlan.invoke({
        prompt: state.prompt,
        projectId: state.projectId,
        context: state.context,
    });

    if (!result.success) {
        sendSSEMessage(state.clientId, {
            type: "analysis_failed",
            message: "Failed to analyze prompt",
            error: result.error,
        });

        return {
            error: result.error || "Analysis failed",
            analysis: { intent: "general", complexity: "medium", requiredTools: [], estimatedSteps: 5 },
        };
    }

    sendSSEMessage(state.clientId, {
        type: "analysis_complete",
        message: `Analysis complete: ${result.analysis.intent} (${result.analysis.complexity} complexity)`,
        analysis: result.analysis,
    });

    return {
        analysis: result.analysis,
    };
};