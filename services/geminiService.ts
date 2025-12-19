import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { RecallFile, RecallType } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models
const MODEL_FAST = 'gemini-3-flash-preview'; 
const MODEL_IMAGE = 'gemini-2.5-flash-image'; 

/**
 * Helper to strip HTML and convert spreadsheet JSON to a clean text representation for the AI
 */
const simplifySpreadsheetForAI = (content: string): string => {
  try {
    if (!content.startsWith('{"appType":"spreadsheet"')) return content.substring(0, 2000);
    
    const data = JSON.parse(content);
    if (data.appType !== 'spreadsheet') return content.substring(0, 2000);

    let summary = "SPREADSHEET DATA (Multiple Tabs):\n";
    data.sheets.forEach((sheet: any) => {
      summary += `\n--- SHEET: ${sheet.name} ---\n`;
      const text = sheet.html
        .replace(/<\/tr>/g, '\n')
        .replace(/<\/td>/g, ' | ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      summary += text.substring(0, 3000);
    });
    return summary;
  } catch (e) {
    return content.substring(0, 2000);
  }
};

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
    const isSpreadsheet = data.startsWith('{"appType":"spreadsheet"');
    const isText = mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml') || filename.endsWith('.md') || filename.endsWith('.ts') || filename.endsWith('.tsx');
    
    const isSupportedBinary = isImage || isVideo || isAudio || isPdf;

    let prompt = `Analyze this material named "${filename}" for Recall OS. 
    
    Generate a JSON object with:
    1. 'title': A professional title.
    2. 'description': A deep summary of key findings, figures, and purposes.
    3. 'tags': 5-8 semantic tags.
    4. 'mood': Professional tone.
    5. 'financial': { "amount": number | null, "currency": "USD", "category": string, "entity": string }
    `;

    const contents = [];
    if (isSupportedBinary) {
      contents.push({ inlineData: { mimeType, data } });
    } else if (isSpreadsheet) {
      contents.push({ text: `SPREADSHEET CONTENT (Parsed):\n${simplifySpreadsheetForAI(data)}` });
    } else if (isText) {
      contents.push({ text: `FILE CONTENT:\n${data}` });
    }
    contents.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: contents },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            mood: { type: Type.STRING },
            financial: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER },
                currency: { type: Type.STRING },
                category: { type: Type.STRING },
                entity: { type: Type.STRING }
              },
              required: ["category", "entity"]
            }
          },
          required: ["title", "description", "tags"]
        }
      }
    });

    const analysis = JSON.parse(response.text || "{}");
    let type = RecallType.DOCUMENT;
    if (isImage) type = RecallType.IMAGE;
    else if (isVideo) type = RecallType.VIDEO;
    else if (isAudio) type = RecallType.AUDIO;
    else if (isText) type = RecallType.TEXT;

    return {
      title: analysis.title || filename,
      description: analysis.description || "Data successfully ingested.",
      type: type,
      metadata: {
        tags: analysis.tags || [],
        mood: analysis.mood || "neutral",
        sourceApp: isSpreadsheet ? "Spreadsheet Engine" : "Recall Core",
        financial: analysis.financial || {}
      }
    };
  } catch (error) {
    console.error("Ingestion failed", error);
    return { title: filename, type: RecallType.DOCUMENT, metadata: { tags: ['file'], mood: 'neutral' } };
  }
};

/**
 * Image Remixing
 */
export const remixMemory = async (originalImageBase64: string, instruction: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_IMAGE,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: originalImageBase64 } },
          { text: `Transform this image based strictly on this instruction: ${instruction}. Maintain original composition.` }
        ]
      }
    });
    let base64Result = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) { base64Result = part.inlineData.data; break; }
      }
    }
    return base64Result;
  } catch (error) { throw error; }
};

/**
 * Edit Full File Content
 */
export const editMemoryContent = async (
  originalContent: string,
  instruction: string
): Promise<{ content: string, reasoning: string }> => {
  try {
    const prompt = `Update the following content based on instruction: "${instruction}"
    
    CONTENT:
    ${originalContent}

    Output strictly JSON with {content, reasoning}.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                content: { type: Type.STRING },
                reasoning: { type: Type.STRING }
            },
            required: ["content", "reasoning"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return { content: result.content, reasoning: result.reasoning || "Applied changes" };
  } catch (error) { throw error; }
};

export type AgentResponse = 
  | { type: 'chat', message: string }
  | { type: 'update', id: string, content: string, reasoning: string }
  | { type: 'create', title: string, memoryType: string, content: string, reasoning: string, sourceIds: string[], tags: string[] };

export const runAgenticCommand = async (command: string, memories: RecallFile[]): Promise<AgentResponse> => {
  try {
    const context = memories.map(m => ({
      id: m.id,
      title: m.title,
      type: m.type,
      tags: m.metadata.tags,
      dataPreview: (m.type === RecallType.TEXT || m.type === RecallType.DOCUMENT) ? m.content.substring(0, 1000) : "[Non-Textual]"
    }));

    const systemPrompt = `You are the Recall OS Agent. You help users manage their memories.
    SYSTEM STATE:
    ${JSON.stringify(context)}
    USER COMMAND: "${command}"`;

    const response = await ai.models.generateContent({
      model: MODEL_FAST,
      contents: { parts: [{ text: systemPrompt }] },
      config: {
        tools: [{ functionDeclarations: [
          { name: "updateMemoryContent", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, newContent: { type: Type.STRING }, reasoning: { type: Type.STRING } } } },
          { name: "createMemory", parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, type: { type: Type.STRING }, content: { type: Type.STRING }, reasoning: { type: Type.STRING } } } }
        ] }]
      }
    });

    const candidate = response.candidates?.[0];
    const toolCall = candidate?.content?.parts?.find(p => p.functionCall)?.functionCall;

    if (toolCall) {
      const args = toolCall.args as any;
      if (toolCall.name === 'updateMemoryContent') return { type: 'update', id: args.id, content: args.newContent, reasoning: args.reasoning };
      if (toolCall.name === 'createMemory') return { type: 'create', title: args.title, memoryType: args.type, content: args.content, reasoning: args.reasoning, sourceIds: [], tags: [] };
    }

    return { type: 'chat', message: response.text || "I'm standing by." };
  } catch (error) { return { type: 'chat', message: "Neural link offline." }; }
};