import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupportedMediaType } from "./image.js";
import { ANALYSIS_PROMPT, INTERACTION_PROMPT, SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

interface ImagePayload {
  base64: string;
  mediaType: SupportedMediaType;
}

export interface GenerateOptions extends ImagePayload {
  componentName: string;
  model?: string;
  analysis?: string;
  interactions?: string;
}

function makeClient(model: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({ model });
}

/**
 * Pass 1 — ask the model to describe the screenshot as structured JSON.
 */
export async function analyzeScreenshot(
  options: ImagePayload & { model?: string }
): Promise<string> {
  const { base64, mediaType, model = DEFAULT_MODEL } = options;

  const client = makeClient(model);
  const result = await client.generateContent({
    systemInstruction: ANALYSIS_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: base64, mimeType: mediaType } },
          { text: "Analyse this UI screenshot and return the JSON description." },
        ],
      },
    ],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini returned no analysis");
  return stripFences(text);
}

/**
 * Pass 2 — identify interactive elements and infer their React behaviour.
 */
export async function analyzeInteractions(
  options: ImagePayload & { analysis: string; model?: string }
): Promise<string> {
  const { base64, mediaType, analysis, model = DEFAULT_MODEL } = options;

  const client = makeClient(model);
  const result = await client.generateContent({
    systemInstruction: INTERACTION_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: base64, mimeType: mediaType } },
          { text: `Design analysis:\n${analysis}\n\nIdentify all interactive elements and their behaviours.` },
        ],
      },
    ],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini returned no interaction analysis");
  return stripFences(text);
}

/**
 * Pass 3 — generate the TSX component using the visual and interaction analyses.
 */
export async function generateComponent(
  options: GenerateOptions
): Promise<string> {
  const { base64, mediaType, componentName, model = DEFAULT_MODEL, analysis, interactions } = options;

  const client = makeClient(model);

  const userParts = [
    { inlineData: { data: base64, mimeType: mediaType } },
    ...(analysis ? [{ text: `Design analysis:\n${analysis}` }] : []),
    ...(interactions ? [{ text: `Interaction analysis:\n${interactions}` }] : []),
    { text: `Generate a React component named "${componentName}" that reproduces this UI screenshot.` },
  ];

  const result = await client.generateContent({
    systemInstruction: SYSTEM_PROMPT,
    contents: [{ role: "user", parts: userParts }],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini API returned no text content");
  return stripFences(text);
}

/**
 * Remove markdown code fences from the response in case Gemini wraps the output anyway.
 * Handles ```tsx, ```ts, ```jsx, ```js, ``` with optional leading/trailing whitespace.
 */
export function stripFences(code: string): string {
  return code
    .replace(/^```[a-zA-Z]*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}
