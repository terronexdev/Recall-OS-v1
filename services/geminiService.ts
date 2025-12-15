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
    
    You are a Data Ingestion Agent. Your goal is to extract STRUCTURED DATA.
    
    Generate a JSON object with:
    1. 'title': A clean, formatted title.
    2. 'description': A concise summary.
    3. 'tags': 5 semantic search tags (include project names, years, document types).
    4. 'mood': The emotional vibe.
    5. 'financial': {
         "amount": number | null (Total value/cost found),
         "currency": string | null (USD, EUR, etc),
         "date": string | null (ISO YYYY-MM-DD found in doc),
         "category": string | null (e.g. "Invoice", "Utility", "Tax", "Payroll", "Receipt"),
         "entity": string | null (Vendor name, Bank name, or Project Name)
       }
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
        sourceApp: "Drag & Drop",
        financial: analysis.financial || {}
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
 * Edit Specific Text Selection
 * This preserves the full context but returns only the replacement string.
 */
export const editSpecificSelection = async (
  fullContext: string,
  selection: string,
  instruction: string
): Promise<string> => {
  try {
    const prompt = `You are a precision text editor.
    
    FULL CONTEXT OF FILE:
    """
    ${fullContext}
    """

    USER HAS SELECTED THIS TEXT SEGMENT:
    "${selection}"

    INSTRUCTION: "${instruction}"

    TASK:
    Rewrite strictly the selected text segment based on the instruction.
    Ensure the new text flows grammatically and contextually with the surrounding (unselected) text.
    Return ONLY the new text string. Do not wrap in markdown or quotes.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: prompt }] }
    });

    return response.text?.trim() || selection;
  } catch (error) {
    console.error("Selection Edit Failed", error);
    throw error;
  }
};

/**
 * Edit Full File Content (Robust)
 * Dedicated function for global file editing.
 */
export const editMemoryContent = async (
  originalContent: string,
  instruction: string
): Promise<{ content: string, reasoning: string }> => {
  try {
    const prompt = `You are an intelligent text editor.
    
    ORIGINAL CONTENT:
    """
    ${originalContent}
    """

    INSTRUCTION: "${instruction}"

    TASK:
    1. Apply the instruction to the content.
    2. Return the FULL updated content. Do not truncate.
    3. Provide a short reasoning for the change.
    
    Output strictly JSON.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                content: { type: Type.STRING, description: "The full updated content" },
                reasoning: { type: Type.STRING, description: "Brief description of changes" }
            },
            required: ["content", "reasoning"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    if (!result.content) throw new Error("AI failed to generate content");
    
    return {
        content: result.content,
        reasoning: result.reasoning || "Applied changes"
    };

  } catch (error) {
    console.error("Edit Failed", error);
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
  description: "Update the text content of a memory file. Use this for editing code, rewriting resumes, fixing typos, or appending info.",
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

// Tool Definition: Create New Memory (Generative)
const toolCreateMemory: FunctionDeclaration = {
  name: "createMemory",
  description: "Create a NEW memory file. Use this for reports, financial summaries, extracting data lists, code generation, or montages.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      type: { type: Type.STRING, enum: ["TEXT", "DOCUMENT", "IMAGE", "AUDIO", "VIDEO"] },
      content: { type: Type.STRING, description: "The content of the new file. For reports, use Markdown tables." },
      reasoning: { type: Type.STRING },
      sourceIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "IDs of memories used to generate this." },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["title", "type", "content", "reasoning"]
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
  | { type: 'create', title: string, memoryType: string, content: string, reasoning: string, sourceIds: string[], tags: string[] }
  | { type: 'move', layout: {id: string, x: number, y: number}[], reasoning: string };

/**
 * The Brain: Handles natural language commands to Edit files, Move them, or Create new ones.
 */
export const runAgenticCommand = async (
  command: string, 
  memories: RecallFile[]
): Promise<AgentResponse> => {
  try {
    // 1. Prepare Context with enhanced metadata for financial/quantitative reasoning
    const context = memories.map(m => ({
      id: m.id,
      title: m.title,
      type: m.type,
      tags: m.metadata.tags,
      // Provide structured data if available, otherwise fallback to truncated content
      financialData: m.metadata.financial || null,
      contentPreview: (m.type === RecallType.TEXT || m.type === RecallType.DOCUMENT) 
          ? m.content.substring(0, 1000) // Lowered preview limit to allow more files in context
          : "[Binary Data]",
      currentPos: { x: m.x, y: m.y }
    }));

    const systemPrompt = `You are the OS Agent. You have control over the user's files (memories).
    
    Current Memories:
    ${JSON.stringify(context)}

    User Command: "${command}"

    CAPABILITIES:
    1. FINANCIAL ANALYST: You can calculate totals, averages, and forecast budgets based on the 'financialData' in the context.
       - If the user asks "How much did I spend?", SUM the financialData.amount values from relevant files.
       - You can create reports using 'createMemory'.
    
    2. GENERAL AGENT:
       - EDIT: Use 'updateMemoryContent'.
       - CREATE: Use 'createMemory' for summaries, extracted lists, code, or reports.
       - ORGANIZE: Use 'organizeCanvas'.
       - CHAT: Answer questions directly if no file change is needed.
    
    RULES:
    - When doing math, BE PRECISE. Use the provided financialData.
    - If creating a report, use Markdown tables.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: systemPrompt }] },
      config: {
        tools: [{ functionDeclarations: [toolUpdateMemory, toolCreateMemory, toolOrganizeCanvas] }]
      }
    });

    const candidate = response.candidates?.[0];
    const toolCall = candidate?.content?.parts?.find(p => p.functionCall)?.functionCall;

    if (toolCall) {
      if (toolCall.name === 'updateMemoryContent') {
        const args = toolCall.args as any;
        return { type: 'update', id: args.id, content: args.newContent, reasoning: args.reasoning };
      }
      if (toolCall.name === 'createMemory') {
        const args = toolCall.args as any;
        return { 
          type: 'create', 
          title: args.title, 
          memoryType: args.type, 
          content: args.content, 
          reasoning: args.reasoning,
          sourceIds: args.sourceIds || [],
          tags: args.tags || []
        };
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