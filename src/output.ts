import { writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { exec } from "child_process";

export interface WriteOptions {
  code: string;
  imageDir: string;
  componentName: string;
  outputOverride?: string;
  css?: string;
}

export interface WriteResult {
  tsx: string;
  css?: string;
}

/**
 * Write the generated component to disk.
 * When css is provided, also writes ComponentName.module.css alongside the TSX.
 * Returns the paths of written files.
 */
export function writeComponent(options: WriteOptions): WriteResult {
  const { code, imageDir, componentName, outputOverride, css } = options;

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

  if (css) {
    const cssPath = join(targetDir, `${componentName}.module.css`);
    writeFileSync(cssPath, css, "utf-8");
    return { tsx: tsxPath, css: cssPath };
  }

  return { tsx: tsxPath };
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
