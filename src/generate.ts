import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { SupportedMediaType } from "./image.js";
import { ANALYSIS_PROMPT, ANIMATION_PROMPT, INTERACTION_PROMPT, STATE_TRANSITION_PROMPT, getGenerationPrompt, getMultiFilePrompt } from "./prompt.js";

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
  designContext?: string;
}

export interface GenerateResult {
  code: string;
  css?: string;
}

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; base64: string; mediaType: SupportedMediaType };
type Part = TextPart | ImagePart;

export function isGroqModel(model: string): boolean {
  return !model.startsWith("gemini");
}

async function generateText(opts: {
  model: string;
  systemPrompt: string;
  parts: Part[];
}): Promise<string> {
  return isGroqModel(opts.model)
    ? generateTextGroq(opts)
    : generateTextGemini(opts);
}

async function generateTextGemini({ model, systemPrompt, parts }: {
  model: string;
  systemPrompt: string;
  parts: Part[];
}): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const client = genAI.getGenerativeModel({ model });

  const geminiParts = parts.map((p) =>
    p.type === "text"
      ? { text: p.text }
      : { inlineData: { data: p.base64, mimeType: p.mediaType } }
  );

  const result = await client.generateContent({
    systemInstruction: systemPrompt,
    contents: [{ role: "user", parts: geminiParts }],
  });

  const text = result.response.text();
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

async function generateTextGroq({ model, systemPrompt, parts }: {
  model: string;
  systemPrompt: string;
  parts: Part[];
}): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const content = parts.map((p) =>
    p.type === "text"
      ? { type: "text" as const, text: p.text }
      : { type: "image_url" as const, image_url: { url: `data:${p.mediaType};base64,${p.base64}` } }
  );

  const result = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    max_tokens: 8192,
  });

  const text = result.choices[0]?.message?.content;
  if (!text) throw new Error("Groq returned no content");
  return text;
}

// ---------------------------------------------------------------------------
// Pipeline passes
// ---------------------------------------------------------------------------

/**
 * Pass 1 — ask the model to describe the screenshot as structured JSON.
 */
export async function analyzeScreenshot(
  options: ImagePayload & { model?: string }
): Promise<string> {
  const { base64, mediaType, model = DEFAULT_MODEL } = options;
  const text = await generateText({
    model,
    systemPrompt: ANALYSIS_PROMPT,
    parts: [
      { type: "image", base64, mediaType },
      { type: "text", text: "Analyse this UI screenshot and return the JSON description." },
    ],
  });
  return stripFences(text);
}

/**
 * Pass 2 — identify interactive elements and infer their React behaviour.
 */
export async function analyzeInteractions(
  options: ImagePayload & { analysis: string; model?: string }
): Promise<string> {
  const { base64, mediaType, analysis, model = DEFAULT_MODEL } = options;
  const text = await generateText({
    model,
    systemPrompt: INTERACTION_PROMPT,
    parts: [
      { type: "image", base64, mediaType },
      { type: "text", text: `Design analysis:\n${analysis}\n\nIdentify all interactive elements and their behaviours.` },
    ],
  });
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
  const text = await generateText({
    model,
    systemPrompt: STATE_TRANSITION_PROMPT,
    parts: [
      { type: "image", base64: image1.base64, mediaType: image1.mediaType },
      { type: "image", base64: image2.base64, mediaType: image2.mediaType },
      { type: "text", text: "The first image is the initial state (before). The second image is the changed state (after). Identify the transition between them." },
    ],
  });
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
    existingCode, secondImage, stateTransition, designContext,
  } = options;

  const parts: Part[] = [
    { type: "image", base64, mediaType },
    ...(secondImage ? [{ type: "image" as const, base64: secondImage.base64, mediaType: secondImage.mediaType }] : []),
    ...(analysis ? [{ type: "text" as const, text: `Design analysis:\n${analysis}` }] : []),
    ...(stateTransition ? [{ type: "text" as const, text: `State transition analysis:\n${stateTransition}` }] : []),
    ...(interactions ? [{ type: "text" as const, text: `Interaction analysis:\n${interactions}` }] : []),
    ...(existingCode ? [{ type: "text" as const, text: `Existing component to update:\n\`\`\`tsx\n${existingCode}\n\`\`\`` }] : []),
    {
      type: "text" as const,
      text: existingCode
        ? `Update the existing React component named "${componentName}" to match the new screenshot.`
        : secondImage
          ? `Generate a single React component named "${componentName}" that implements both UI states shown in the two screenshots, with toggle logic to switch between them.`
          : `Generate a React component named "${componentName}" that reproduces this UI screenshot.`,
    },
  ];

  const text = await generateText({
    model,
    systemPrompt: getGenerationPrompt(!!existingCode, style, designContext),
    parts,
  });

  if (!text) throw new Error("Model returned no text content");

  if (style === "css-modules") {
    const [tsxPart, cssPart] = text.split("===CSS===");
    return { code: stripFences(tsxPart ?? ""), css: stripFences(cssPart ?? "") };
  }

  return { code: stripFences(text) };
}

/**
 * Pass 4 (optional) — layer Framer Motion animations onto a generated component.
 */
export async function animateComponent(options: {
  code: string;
  interactions?: string;
  model?: string;
}): Promise<string> {
  const { code, interactions, model = DEFAULT_MODEL } = options;
  const text = await generateText({
    model,
    systemPrompt: ANIMATION_PROMPT,
    parts: [
      { type: "text", text: `Component code:\n\`\`\`tsx\n${code}\n\`\`\`` },
      ...(interactions ? [{ type: "text" as const, text: `Interaction analysis:\n${interactions}` }] : []),
      { type: "text", text: "Add Framer Motion animations to this component." },
    ],
  });
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
    analysis, interactions, existingCode, secondImage, stateTransition, designContext,
  } = options;

  const hookName = deriveHookName(componentName);
  const typesBaseName = deriveTypesBaseName(componentName);

  const parts: Part[] = [
    { type: "image", base64, mediaType },
    ...(secondImage ? [{ type: "image" as const, base64: secondImage.base64, mediaType: secondImage.mediaType }] : []),
    ...(analysis ? [{ type: "text" as const, text: `Design analysis:\n${analysis}` }] : []),
    ...(stateTransition ? [{ type: "text" as const, text: `State transition analysis:\n${stateTransition}` }] : []),
    ...(interactions ? [{ type: "text" as const, text: `Interaction analysis:\n${interactions}` }] : []),
    ...(existingCode ? [{ type: "text" as const, text: `Existing component to update:\n\`\`\`tsx\n${existingCode}\n\`\`\`` }] : []),
    {
      type: "text" as const,
      text: existingCode
        ? `Update the existing feature slice to match the new screenshot. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`
        : secondImage
          ? `Generate a feature slice for a React component with two UI states. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`
          : `Generate a feature slice for a React component that reproduces this UI. Component: ${componentName} (${componentName}.tsx). Hook: ${hookName} (${hookName}.ts). Types: ${typesBaseName} (${typesBaseName}.ts).`,
    },
  ];

  let text: string;
  try {
    text = await generateText({
      model,
      systemPrompt: getMultiFilePrompt(!!existingCode, designContext),
      parts,
    });
  } catch {
    return null;
  }

  return parseMultiFileResponse(text);
}

/**
 * Remove markdown code fences from the response in case the model wraps the output anyway.
 */
export function stripFences(code: string): string {
  return code
    .replace(/^```[a-zA-Z]*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}
