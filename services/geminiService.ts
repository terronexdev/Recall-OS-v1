import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { RecallFile, RecallType } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Models
const MODEL_FAST = 'gemini-3-flash-preview'; // Upgraded to latest for better reasoning
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
      // Very simple HTML to text conversion for tables
      const text = sheet.html
        .replace(/<\/tr>/g, '\n') // New line for rows
        .replace(/<\/td>/g, ' | ') // Separator for cells
        .replace(/<[^>]+>/g, '')  // Strip all other tags
        .replace(/\s+/g, ' ')     // Collapse whitespace
        .trim();
      
      summary += text.substring(0, 3000); // Take a large chunk of each sheet
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
    3. 'tags': 5-8 semantic tags (categories, projects, entities).
    4. 'mood': Professional tone.
    5. 'financial': {
         "amount": number | null (Extract the most prominent Total Budget or Grand Total),
         "currency": "USD",
         "date": string | null,
         "category": string,
         "entity": string (The main project or vendor)
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
    } else if (isSpreadsheet) {
      // Send the AI a cleaned text version of the spreadsheet to help it build the summary
      contents.push({ text: `SPREADSHEET CONTENT (Parsed):\n${simplifySpreadsheetForAI(data)}` });
    } else if (isText) {
      contents.push({ text: `FILE CONTENT:\n${data}` });
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
      description: analysis.description || "Data successfully ingested.",
      type: type,
      metadata: {
        tags: analysis.tags || [],
        mood: analysis.mood || "neutral",
        location: "Unknown",
        sourceApp: isSpreadsheet ? "Spreadsheet Engine" : "Drag & Drop",
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
 * Image Remixing
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
 */
export const editSpecificSelection = async (
  fullContext: string,
  selection: string,
  instruction: string
): Promise<string> => {
  try {
    const prompt = `You are a precision text editor.
    
    FULL CONTEXT:
    """
    ${fullContext}
    """

    USER SELECTION:
    "${selection}"

    INSTRUCTION: "${instruction}"

    TASK:
    Rewrite strictly the selected text segment. Return ONLY the new string.
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

    const response = await ai.models.generateContent({
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

const toolUpdateMemory: FunctionDeclaration = {
  name: "updateMemoryContent",
  description: "Update text content of a memory. Use for editing documents or fixing data.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      newContent: { type: Type.STRING },
      reasoning: { type: Type.STRING }
    },
    required: ["id", "newContent", "reasoning"]
  }
};

const toolCreateMemory: FunctionDeclaration = {
  name: "createMemory",
  description: "Create a NEW memory report or summary based on existing data.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      type: { type: Type.STRING, enum: ["TEXT", "DOCUMENT", "IMAGE"] },
      content: { type: Type.STRING },
      reasoning: { type: Type.STRING },
      sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["title", "type", "content", "reasoning"]
  }
};

const toolOrganizeCanvas: FunctionDeclaration = {
  name: "organizeCanvas",
  description: "Arrange memory clusters visually on the canvas.",
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

export const runAgenticCommand = async (
  command: string, 
  memories: RecallFile[]
): Promise<AgentResponse> => {
  try {
    // PREPARE INTELLIGENT CONTEXT
    const context = memories.map(m => {
      // Logic: If it's a spreadsheet, we must parse the tabs into a text summary 
      // so the model can actually see the data rows instead of just JSON metadata.
      const simplifiedContent = (m.type === RecallType.TEXT || m.type === RecallType.DOCUMENT)
        ? simplifySpreadsheetForAI(m.content)
        : "[Non-Textual Data]";

      return {
        id: m.id,
        title: m.title,
        type: m.type,
        tags: m.metadata.tags,
        financialSummary: m.metadata.financial || null,
        dataPreview: simplifiedContent, // This now contains cleaned multi-tab text
        currentPos: { x: m.x, y: m.y }
      };
    });

    const systemPrompt = `You are the Recall OS Agent. You have access to the user's memory core.
    
    SYSTEM STATE:
    ${JSON.stringify(context)}

    USER COMMAND: "${command}"

    SPECIFIC INSTRUCTIONS FOR SPREADSHEETS:
    - Many memories are 'Spreadsheets'. These contain multiple tabs (e.g., 'Parcel Master', 'Financial Tracker').
    - When asked about budget specifics, parcel counts, or project status, look deep into the 'dataPreview' provided for those files.
    - If a user asks for a cross-project summary, aggregate data from all relevant memories.
    - BE PRECISE. Use the specific dollar amounts and parcel IDs found in the data rows.

    CAPABILITIES:
    1. ANALYST: Sum budgets, calculate averages, list specific high-risk parcels.
    2. ARCHITECT: Cluster files by project name or status using 'organizeCanvas'.
    3. CREATOR: Generate new 'TEXT' or 'DOCUMENT' reports summarizing findings.
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

    return { type: 'chat', message: response.text || "I've analyzed the data but no action was required." };

  } catch (error) {
    console.error("Agent Error:", error);
    return { type: 'chat', message: "Agent failed to connect to neural core." };
  }
};