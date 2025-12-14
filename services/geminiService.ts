import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { RecallFile, RecallType } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models
const MODEL_FAST = 'gemini-2.5-flash';
const MODEL_IMAGE = 'gemini-2.5-flash-image'; 

/**
 * Ingests raw content and creates a structured .recall memory.
 */
export const ingestRecall = async (
  data: string, 
  mimeType: string,
  filename: string
): Promise<Partial<RecallFile>> => {
  try {
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');
    const isPdf = mimeType === 'application/pdf';
    // If mimeType is text/html, it's likely our parsed DOCX
    const isText = mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml') || filename.endsWith('.md') || filename.endsWith('.ts') || filename.endsWith('.tsx');
    
    const isSupportedBinary = isImage || isVideo || isAudio || isPdf;

    let prompt = `Analyze this file named "${filename}" for the 'Recall OS'. 
    Generate a JSON object with:
    1. 'title': A clean, formatted title based on the filename or content.
    2. 'description': A concise summary of the content.
    3. 'tags': A list of 5 semantic search tags.
    4. 'mood': The emotional vibe or professional context.
    `;

    const contents = [];

    if (isSupportedBinary) {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: data
        }
      });
    } else if (isText) {
      // For Text or HTML (parsed DOCX), send as text part
      contents.push({ text: `FILE CONTENT:\n${data}` });
    } else {
      prompt += `\nNOTE: This is a binary file (${mimeType}) that could not be fully parsed. Infer context from the filename "${filename}".`;
    }
    
    contents.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: contents },
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const analysis = JSON.parse(text);

    let type = RecallType.DOCUMENT;
    if (isImage) type = RecallType.IMAGE;
    else if (isVideo) type = RecallType.VIDEO;
    else if (isAudio) type = RecallType.AUDIO;
    else if (isText) type = RecallType.TEXT;

    return {
      title: analysis.title || filename,
      description: analysis.description || "File imported.",
      type: type,
      metadata: {
        tags: analysis.tags || [],
        mood: analysis.mood || "neutral",
        location: "Unknown",
        sourceApp: "Drag & Drop"
      }
    };

  } catch (error) {
    console.error("Ingestion failed", error);
    return {
        title: filename,
        description: "Imported file.",
        type: RecallType.DOCUMENT,
        metadata: { tags: ['file'], mood: 'neutral' }
    };
  }
};

/**
 * Image Remixing (Legacy/Specific Image Tool)
 */
export const remixMemory = async (
  originalImageBase64: string,
  instruction: string
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_IMAGE,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: originalImageBase64 } },
          { text: `Transform this image based strictly on this instruction: ${instruction}. Maintain composition.` }
        ]
      }
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  } catch (error) {
    console.error("Remix failed", error);
    throw error;
  }
};

/**
 * ---------------------------------------------------------
 * AGENTIC CORE
 * ---------------------------------------------------------
 */

// Tool Definition: Update Content (Text/Code/Docs)
const toolUpdateMemory: FunctionDeclaration = {
  name: "updateMemoryContent",
  description: "Update the text content of a memory file based on user instructions. Use this for editing code, rewriting resumes, fixing typos, or appending info.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: "The ID of the memory to update." },
      newContent: { type: Type.STRING, description: "The full, updated text content of the file." },
      reasoning: { type: Type.STRING, description: "Short explanation of what changed." }
    },
    required: ["id", "newContent", "reasoning"]
  }
};

// Tool Definition: Spatial Organization
const toolOrganizeCanvas: FunctionDeclaration = {
  name: "organizeCanvas",
  description: "Move memories to new x,y coordinates on the canvas based on a sorting or clustering logic.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      layout: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
          required: ["id", "x", "y"]
        }
      },
      reasoning: { type: Type.STRING }
    },
    required: ["layout", "reasoning"]
  }
};

export type AgentResponse = 
  | { type: 'chat', message: string }
  | { type: 'update', id: string, content: string, reasoning: string }
  | { type: 'move', layout: {id: string, x: number, y: number}[], reasoning: string };

/**
 * The Brain: Handles natural language commands to Edit files OR Move them.
 */
export const runAgenticCommand = async (
  command: string, 
  memories: RecallFile[]
): Promise<AgentResponse> => {
  try {
    // 1. Prepare Context (Limit content length for token sanity)
    const context = memories.map(m => ({
      id: m.id,
      title: m.title,
      type: m.type,
      tags: m.metadata.tags,
      // Only include content if it's text-based and reasonably sized, otherwise just metadata
      contentPreview: (m.type === RecallType.TEXT || m.type === RecallType.DOCUMENT) ? m.content.substring(0, 3000) : "[Binary Data]",
      currentPos: { x: m.x, y: m.y }
    }));

    const systemPrompt = `You are the OS Agent. You have control over the user's files (memories).
    
    Current Memories:
    ${JSON.stringify(context)}

    User Command: "${command}"

    RULES:
    1. If the user wants to EDIT a file (e.g., "Add skill to resume", "Fix code"), find the matching ID and use 'updateMemoryContent'. 
       You MUST generate the FULL content with the changes applied.
    2. If the user wants to ORGANIZE (e.g., "Sort by type", "Cluster by mood"), use 'organizeCanvas'.
    3. If it's a question, just answer.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: systemPrompt }] },
      config: {
        tools: [{ functionDeclarations: [toolUpdateMemory, toolOrganizeCanvas] }]
      }
    });

    const candidate = response.candidates?.[0];
    const toolCall = candidate?.content?.parts?.find(p => p.functionCall)?.functionCall;

    if (toolCall) {
      if (toolCall.name === 'updateMemoryContent') {
        const args = toolCall.args as any;
        return { type: 'update', id: args.id, content: args.newContent, reasoning: args.reasoning };
      }
      if (toolCall.name === 'organizeCanvas') {
        const args = toolCall.args as any;
        return { type: 'move', layout: args.layout, reasoning: args.reasoning };
      }
    }

    return { type: 'chat', message: response.text || "I processed that but made no changes." };

  } catch (error) {
    console.error("Agent Error:", error);
    return { type: 'chat', message: "System Error: The Agent failed to execute." };
  }
};