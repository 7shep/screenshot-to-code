import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupportedMediaType } from "./image.js";
import { ANALYSIS_PROMPT, ANIMATION_PROMPT, INTERACTION_PROMPT, STATE_TRANSITION_PROMPT, getGenerationPrompt, MULTI_FILE_SYSTEM_PROMPT, MULTI_FILE_REFINE_PROMPT } from "./prompt.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";

export interface ImagePayload {
  base64: string;
  mediaType: SupportedMediaType;
}

export interface GenerateOptions extends ImagePayload {
  componentName: string;
  model?: string;
  analysis?: string;
  interactions?: string;
  style?: string;
  existingCode?: string;
  secondImage?: ImagePayload;
  stateTransition?: string;
}

export interface GenerateResult {
  code: string;
  css?: string;
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
 * Pass 1.5 (two-states mode) — identify the state transition between two screenshots.
 */
export async function analyzeStateTransition(options: {
  image1: ImagePayload;
  image2: ImagePayload;
  model?: string;
}): Promise<string> {
  const { image1, image2, model = DEFAULT_MODEL } = options;

  const client = makeClient(model);
  const result = await client.generateContent({
    systemInstruction: STATE_TRANSITION_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: image1.base64, mimeType: image1.mediaType } },
          { inlineData: { data: image2.base64, mimeType: image2.mediaType } },
          { text: "The first image is the initial state (before). The second image is the changed state (after). Identify the transition between them." },
        ],
      },
    ],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini returned no state transition analysis");
  return stripFences(text);
}

/**
 * Pass 3 — generate the TSX component using the visual and interaction analyses.
 * Returns { code, css } where css is only present for the css-modules style preset.
 */
export async function generateComponent(
  options: GenerateOptions
): Promise<GenerateResult> {
  const {
    base64, mediaType, componentName, model = DEFAULT_MODEL,
    analysis, interactions, style = "tailwind",
    existingCode, secondImage, stateTransition,
  } = options;

  const client = makeClient(model);

  const userParts = [
    { inlineData: { data: base64, mimeType: mediaType } },
    ...(secondImage ? [{ inlineData: { data: secondImage.base64, mimeType: secondImage.mediaType } }] : []),
    ...(analysis ? [{ text: `Design analysis:\n${analysis}` }] : []),
    ...(stateTransition ? [{ text: `State transition analysis:\n${stateTransition}` }] : []),
    ...(interactions ? [{ text: `Interaction analysis:\n${interactions}` }] : []),
    ...(existingCode ? [{ text: `Existing component to update:\n\`\`\`tsx\n${existingCode}\n\`\`\`` }] : []),
    {
      text: existingCode
        ? `Update the existing React component named "${componentName}" to match the new screenshot.`
        : secondImage
          ? `Generate a single React component named "${componentName}" that implements both UI states shown in the two screenshots, with toggle logic to switch between them.`
          : `Generate a React component named "${componentName}" that reproduces this UI screenshot.`,
    },
  ];

  const result = await client.generateContent({
    systemInstruction: getGenerationPrompt(!!existingCode, style),
    contents: [{ role: "user", parts: userParts }],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini API returned no text content");

  if (style === "css-modules") {
    const [tsxPart, cssPart] = text.split("===CSS===");
    return { code: stripFences(tsxPart ?? ""), css: stripFences(cssPart ?? "") };
  }

  return { code: stripFences(text) };
}

/**
 * Pass 4 (optional) — layer Framer Motion animations onto a generated component.
 * Image is not needed; only the code and interaction context are sent.
 */
export async function animateComponent(options: {
  code: string;
  interactions?: string;
  model?: string;
}): Promise<string> {
  const { code, interactions, model = DEFAULT_MODEL } = options;

  const client = makeClient(model);
  const result = await client.generateContent({
    systemInstruction: ANIMATION_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          { text: `Component code:\n\`\`\`tsx\n${code}\n\`\`\`` },
          ...(interactions ? [{ text: `Interaction analysis:\n${interactions}` }] : []),
          { text: "Add Framer Motion animations to this component." },
        ],
      },
    ],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini returned no animated component");
  return stripFences(text);
}

/**
 * Pass 3 (multi-file variant) — generate a feature slice: types + hook + component.
 * Returns null on parse failure so the caller can fall back to single-file mode.
 */
export interface MultiFileResult {
  tsx: string;
  hook: string;
  types: string;
}

export function deriveHookName(componentName: string): string {
  return `use${componentName}`;
}

export function deriveTypesBaseName(componentName: string): string {
  return componentName.charAt(0).toLowerCase() + componentName.slice(1) + ".types";
}

function parseMultiFileResponse(raw: string): MultiFileResult | null {
  const typesMatch = raw.match(/<types>([\s\S]*?)<\/types>/);
  const hookMatch = raw.match(/<hook>([\s\S]*?)<\/hook>/);
  const componentMatch = raw.match(/<component>([\s\S]*?)<\/component>/);

  if (!typesMatch || !hookMatch || !componentMatch) return null;

  return {
    types: stripFences(typesMatch[1].trim()),
    hook: stripFences(hookMatch[1].trim()),
    tsx: stripFences(componentMatch[1].trim()),
  };
}

export async function generateComponentMultiFile(
  options: GenerateOptions
): Promise<MultiFileResult | null> {
  const {
    base64, mediaType, componentName, model = DEFAULT_MODEL,
    analysis, interactions, existingCode, secondImage, stateTransition,
  } = options;

  const hookName = deriveHookName(componentName);
  const typesBaseName = deriveTypesBaseName(componentName);

  const client = makeClient(model);

  const userParts = [
    { inlineData: { data: base64, mimeType: mediaType } },
    ...(secondImage ? [{ inlineData: { data: secondImage.base64, mimeType: secondImage.mediaType } }] : []),
    ...(analysis ? [{ text: `Design analysis:\n${analysis}` }] : []),
    ...(stateTransition ? [{ text: `State transition analysis:\n${stateTransition}` }] : []),
    ...(interactions ? [{ text: `Interaction analysis:\n${interactions}` }] : []),
    ...(existingCode ? [{ text: `Existing component to update:\n\`\`\`tsx\n${existingCode}\n\`\`\`` }] : []),
    {
      text: existingCode
        ? `Update the existing feature slice to match the new screenshot. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`
        : secondImage
          ? `Generate a feature slice for a React component with two UI states. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`
          : `Generate a feature slice for a React component that reproduces this UI. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`,
    },
  ];

  const result = await client.generateContent({
    systemInstruction: existingCode ? MULTI_FILE_REFINE_PROMPT : MULTI_FILE_SYSTEM_PROMPT,
    contents: [{ role: "user", parts: userParts }],
  });

  const text = result.response.text();
  if (!text) return null;

  return parseMultiFileResponse(text);
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
