import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { loadImage, deriveComponentName } from "../../src/image.js";
import {
  analyzeScreenshot,
  analyzeInteractions,
  generateComponent,
  generateComponentMultiFile,
  animateComponent,
  DEFAULT_MODEL,
} from "../../src/generate.js";
import { buildDesignSystemContext, detectUsedComponents } from "../../src/design-system.js";
import { writeComponent } from "../../src/output.js";

export interface RunOptions {
  imagePath: string;
  componentName?: string;
  model?: string;
  animate?: boolean;
  singleFile?: boolean;
  style?: "tailwind" | "css-modules" | "styled-components";
  noDesignSystem?: boolean;
  componentsDir?: string;
  outputDir?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  onProgress: (pass: number, total: number, label: string) => void;
}

export interface RunResult {
  tsx: string;
  hook?: string;
  types?: string;
  css?: string;
  usedComponents: string[];
}

export async function run(options: RunOptions): Promise<RunResult> {
  const {
    imagePath,
    componentName: nameOverride,
    model = DEFAULT_MODEL,
    animate,
    singleFile,
    style = "tailwind",
    noDesignSystem,
    componentsDir,
    outputDir,
    geminiApiKey,
    groqApiKey,
    onProgress,
  } = options;

  // Inject API keys — generate.ts reads from process.env at call time.
  if (geminiApiKey) process.env.GEMINI_API_KEY = geminiApiKey;
  if (groqApiKey) process.env.GROQ_API_KEY = groqApiKey;

  // Resolve workspace root from image location (multi-root aware).
  const wsFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(imagePath));
  if (!wsFolder) {
    throw new Error(
      "No workspace folder found for this image — open a workspace folder first."
    );
  }
  const projectRoot = wsFolder.uri.fsPath;
  const imageDir = outputDir ? path.resolve(outputDir) : path.dirname(imagePath);
  const componentName = nameOverride ?? deriveComponentName(imagePath);

  const totalPasses = animate ? 5 : 4;

  // Pass 0: design system context
  let designContext: string | undefined;
  let dsComponentNames: string[] = [];

  if (!noDesignSystem) {
    onProgress(0, totalPasses, "loading design system...");
    try {
      const ds = await buildDesignSystemContext(
        projectRoot,
        componentsDir || undefined
      );
      designContext = ds.context ?? undefined;
      dsComponentNames = ds.componentNames;
    } catch {
      // Non-fatal — continue without design system context
    }
  }

  // Pass 1: analyse screenshot
  onProgress(1, totalPasses, "analysing screenshot...");
  const imageData = loadImage(imagePath);
  const analysis = await analyzeScreenshot({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    model,
  });

  // Pass 2: analyse interactions
  onProgress(2, totalPasses, "analysing interactions...");
  const interactions = await analyzeInteractions({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    analysis,
    model,
  });

  // Pass 3: generate component
  onProgress(3, totalPasses, "generating component...");

  let tsx: string;
  let hook: string | undefined;
  let types: string | undefined;
  let css: string | undefined;

  if (!singleFile) {
    const multiResult = await generateComponentMultiFile({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      componentName,
      model,
      analysis,
      interactions,
      designContext,
    });

    if (multiResult) {
      tsx = multiResult.tsx;
      hook = multiResult.hook;
      types = multiResult.types;
    } else {
      // XML parse failed — fall back to single-file
      const r = await generateComponent({
        base64: imageData.base64,
        mediaType: imageData.mediaType,
        componentName,
        model,
        analysis,
        interactions,
        style,
        designContext,
      });
      tsx = r.code;
      css = r.css;
    }
  } else {
    const r = await generateComponent({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      componentName,
      model,
      analysis,
      interactions,
      style,
      designContext,
    });
    tsx = r.code;
    css = r.css;
  }

  // Pass 4 (optional): animations
  if (animate) {
    onProgress(4, totalPasses, "adding animations...");
    tsx = await animateComponent({ code: tsx, interactions, model });
  }

  // Write files to disk
  const written = writeComponent({
    code: tsx,
    css,
    hook,
    types,
    imageDir,
    componentName,
  });

  // Detect which design system components appear in the output
  const usedComponents =
    dsComponentNames.length > 0 ? detectUsedComponents(tsx, dsComponentNames) : [];

  return {
    tsx: written.tsx,
    hook: written.hook,
    types: written.types,
    css: written.css,
    usedComponents,
  };
}
