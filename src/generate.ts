import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupportedMediaType } from "./image.js";
import { ANALYSIS_PROMPT, SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

interface ImagePayload {
  base64: string;
  mediaType: SupportedMediaType;
}

export interface GenerateOptions extends ImagePayload {
  componentName: string;
  model?: string;
  analysis?: string;
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
 * Pass 2 — generate the TSX component, optionally using a prior analysis.
 */
export async function generateComponent(
  options: GenerateOptions
): Promise<string> {
  const { base64, mediaType, componentName, model = DEFAULT_MODEL, analysis } = options;

  const client = makeClient(model);

  const userParts = [
    { inlineData: { data: base64, mimeType: mediaType } },
    ...(analysis ? [{ text: `Design analysis:\n${analysis}` }] : []),
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
