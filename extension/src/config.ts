import * as vscode from "vscode";

export interface S2CConfig {
  componentsDir: string;
  outputDir: string;
  defaultStyle: "tailwind" | "css-modules" | "styled-components";
  defaultAnimate: boolean;
  defaultSingleFile: boolean;
  model: string;
}

export async function getApiKey(
  secrets: vscode.SecretStorage,
  model: string
): Promise<string | undefined> {
  // Groq models use GROQ_API_KEY; everything else uses Gemini
  const isGroq = isGroqModelName(model);
  return isGroq
    ? secrets.get("s2c.groqApiKey")
    : secrets.get("s2c.geminiApiKey");
}

export async function hasAnyApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
  const gemini = await secrets.get("s2c.geminiApiKey");
  const groq = await secrets.get("s2c.groqApiKey");
  return !!(gemini || groq);
}

export async function getKeyStatus(
  secrets: vscode.SecretStorage
): Promise<{ hasGeminiKey: boolean; hasGroqKey: boolean }> {
  const gemini = await secrets.get("s2c.geminiApiKey");
  const groq = await secrets.get("s2c.groqApiKey");
  return { hasGeminiKey: !!gemini, hasGroqKey: !!groq };
}

export function getSettings(): S2CConfig {
  const cfg = vscode.workspace.getConfiguration("s2c");
  return {
    componentsDir: cfg.get("componentsDir", ""),
    outputDir: cfg.get("outputDir", ""),
    defaultStyle: cfg.get<S2CConfig["defaultStyle"]>("defaultStyle", "tailwind"),
    defaultAnimate: cfg.get("defaultAnimate", false),
    defaultSingleFile: cfg.get("defaultSingleFile", false),
    model: cfg.get("model", "gemini-2.5-flash"),
  };
}

export async function saveSettings(
  updates: Partial<Omit<S2CConfig, "defaultStyle"> & { defaultStyle: string }>
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("s2c");
  for (const [key, value] of Object.entries(updates)) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
  }
}

const GROQ_PREFIXES = ["llama", "mixtral", "gemma", "whisper", "deepseek", "qwen", "llava"];

function isGroqModelName(model: string): boolean {
  const lower = model.toLowerCase();
  return GROQ_PREFIXES.some((p) => lower.startsWith(p));
}
