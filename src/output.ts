import { writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { exec } from "child_process";

export interface WriteOptions {
  code: string;
  imageDir: string;
  componentName: string;
  outputOverride?: string;
}

/**
 * Write the generated component code to disk.
 * Returns the absolute path of the written file.
 */
export function writeComponent(options: WriteOptions): string {
  const { code, imageDir, componentName, outputOverride } = options;

  let targetPath: string;

  if (outputOverride) {
    // If the override looks like a directory (no .tsx/.ts/.jsx/.js extension), append the filename
    if (!/\.(tsx?|jsx?)$/i.test(outputOverride)) {
      targetPath = resolve(join(outputOverride, `${componentName}.tsx`));
    } else {
      targetPath = resolve(outputOverride);
    }
  } else {
    targetPath = resolve(join(imageDir, `${componentName}.tsx`));
  }

  writeFileSync(targetPath, code, "utf-8");
  return targetPath;
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
