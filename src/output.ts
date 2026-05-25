import { writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { exec } from "child_process";
import { deriveHookName, deriveTypesBaseName } from "./generate.js";

export interface WriteOptions {
  code: string;
  imageDir: string;
  componentName: string;
  outputOverride?: string;
  css?: string;
  hook?: string;
  types?: string;
}

export interface WriteResult {
  tsx: string;
  css?: string;
  hook?: string;
  types?: string;
}

/**
 * Write the generated component to disk.
 * When css is provided, also writes ComponentName.module.css alongside the TSX.
 * Returns the paths of written files.
 */
export function writeComponent(options: WriteOptions): WriteResult {
  const { code, imageDir, componentName, outputOverride, css, hook, types } = options;

  let targetDir: string;
  let tsxPath: string;

  if (outputOverride) {
    if (!/\.(tsx?|jsx?)$/i.test(outputOverride)) {
      targetDir = resolve(outputOverride);
      tsxPath = join(targetDir, `${componentName}.tsx`);
    } else {
      tsxPath = resolve(outputOverride);
      targetDir = dirname(tsxPath);
    }
  } else {
    targetDir = resolve(imageDir);
    tsxPath = join(targetDir, `${componentName}.tsx`);
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(tsxPath, code, "utf-8");

  const result: WriteResult = { tsx: tsxPath };

  if (css) {
    const cssPath = join(targetDir, `${componentName}.module.css`);
    writeFileSync(cssPath, css, "utf-8");
    result.css = cssPath;
  }

  if (hook) {
    const hookPath = join(targetDir, `${deriveHookName(componentName)}.ts`);
    writeFileSync(hookPath, hook, "utf-8");
    result.hook = hookPath;
  }

  if (types) {
    const typesPath = join(targetDir, `${deriveTypesBaseName(componentName)}.ts`);
    writeFileSync(typesPath, types, "utf-8");
    result.types = typesPath;
  }

  return result;
}

/**
 * Open a file in VS Code. Failure is non-fatal — a warning is printed instead.
 */
export function openInEditor(filePath: string): void {
  // Quote the path to handle spaces
  const quoted = `"${filePath}"`;
  exec(`code ${quoted}`, (err) => {
    if (err) {
      // Don't crash — VS Code may not be installed or on PATH
      process.stderr.write(
        `  ⚠  Could not open VS Code: ${err.message}\n`
      );
    }
  });
}
