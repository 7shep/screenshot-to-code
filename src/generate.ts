import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupportedMediaType } from "./image.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

export interface GenerateOptions {
  base64: string;
  mediaType: SupportedMediaType;
  componentName: string;
  model?: string;
}

/**
 * Call the Gemini API with a screenshot image and return generated TSX code.
 */
export async function generateComponent(
  options: GenerateOptions
): Promise<string> {
  const { base64, mediaType, componentName, model = DEFAULT_MODEL } = options;

  const apiKey = process.env.GEMINI_API_KEY!;
  const genAI = new GoogleGenerativeAI(apiKey);

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await geminiModel.generateContent([
    {
      inlineData: {
        data: base64,
        mimeType: mediaType,
      },
    },
    `Generate a React component named "${componentName}" that reproduces this UI screenshot.`,
  ]);

  const text = result.response.text();
  if (!text) {
    throw new Error("Gemini API returned no text content");
  }

  return stripFences(text);
}

/**
 * Remove markdown code fences from the response in case Gemini wraps the output anyway.
 * Handles ```tsx, ```ts, ```jsx, ```js, ``` with optional leading/trailing whitespace.
 */
function stripFences(code: string): string {
  return code
    .replace(/^```[a-zA-Z]*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}
