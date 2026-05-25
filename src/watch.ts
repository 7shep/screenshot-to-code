import { watch, existsSync } from "fs";
import { resolve, extname } from "path";
import chalk from "chalk";
import { SUPPORTED_EXTENSIONS, loadImage, deriveComponentName } from "./image.js";
import { analyzeScreenshot, analyzeInteractions, generateComponent, generateComponentMultiFile, animateComponent } from "./generate.js";
import { writeComponent, openInEditor } from "./output.js";
import type { StylePreset } from "./args.js";

export interface WatchOptions {
  watchDir: string;
  outputPath?: string;
  model: string;
  noOpen: boolean;
  animate: boolean;
  style: StylePreset;
  singleFile?: boolean;
}

export async function processFile(absPath: string, options: WatchOptions): Promise<void> {
  const { outputPath, model, noOpen, animate, style, singleFile } = options;
  const componentName = deriveComponentName(absPath);
  const imageDir = process.cwd();
  const label = chalk.cyan(`[${componentName}]`);

  console.log(`${label} ${chalk.dim("reading image...")}`);
  const imageData = loadImage(absPath);

  console.log(`${label} ${chalk.dim(`analysing screenshot (${model})...`)}`);
  const analysis = await analyzeScreenshot({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    model,
  });

  console.log(`${label} ${chalk.dim("analysing interactions...")}`);
  const interactions = await analyzeInteractions({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    analysis,
    model,
  });

  if (!singleFile) {
    console.log(`${label} ${chalk.dim("generating component (3 files)...")}`);
    let multiResult = null;
    try {
      multiResult = await generateComponentMultiFile({
        base64: imageData.base64,
        mediaType: imageData.mediaType,
        componentName,
        model,
        analysis,
        interactions,
      });
    } catch (err) {
      console.log(`${label} ${chalk.yellow("⚠")} multi-file generation failed, falling back to single-file`);
    }

    if (multiResult) {
      if (animate) {
        console.log(`${label} ${chalk.dim("adding animations...")}`);
        multiResult.tsx = await animateComponent({ code: multiResult.tsx, interactions, model });
      }
      const written = writeComponent({ code: multiResult.tsx, hook: multiResult.hook, types: multiResult.types, imageDir, componentName, outputOverride: outputPath });
      console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(written.tsx)}`);
      if (written.hook) console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(written.hook)}`);
      if (written.types) console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(written.types)}`);
      if (!noOpen) {
        openInEditor(written.tsx);
        console.log(`${label} ${chalk.green("✓")} opened in VS Code`);
      }
      return;
    }
    console.log(`${label} ${chalk.yellow("⚠")} multi-file parse failed, falling back to single-file`);
  }

  // Single-file path
  console.log(`${label} ${chalk.dim("generating component...")}`);
  let generated = await generateComponent({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    componentName,
    model,
    analysis,
    interactions,
    style,
  });

  if (animate) {
    console.log(`${label} ${chalk.dim("adding animations...")}`);
    generated.code = await animateComponent({ code: generated.code, interactions, model });
  }

  const written = writeComponent({ code: generated.code, css: generated.css, imageDir, componentName, outputOverride: outputPath });
  console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(written.tsx)}`);
  if (written.css) console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(written.css)}`);

  if (!noOpen) {
    openInEditor(written.tsx);
    console.log(`${label} ${chalk.green("✓")} opened in VS Code`);
  }
}

export async function startWatch(options: WatchOptions): Promise<void> {
  const absWatchDir = resolve(options.watchDir);

  if (!existsSync(absWatchDir)) {
    throw new Error(`Watch directory not found: ${options.watchDir}`);
  }

  console.log(`\n${chalk.cyan("◉")} watching ${chalk.bold(absWatchDir)}`);
  if (options.outputPath) {
    console.log(chalk.dim(`  → output: ${resolve(options.outputPath)}`));
  }
  console.log(chalk.dim("  Press Ctrl+C to stop\n"));

  // Track files currently being processed to deduplicate rapid watcher events
  const inProgress = new Set<string>();

  const watcher = watch(absWatchDir, (eventType, filename) => {
    if (!filename || eventType !== "rename") return;

    const ext = extname(filename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

    const absPath = resolve(absWatchDir, filename);

    if (inProgress.has(absPath)) return;
    inProgress.add(absPath);

    // Delay before checking existence: on Windows the rename event fires before
    // the file is visible to existsSync, so we must wait for the write to land.
    setTimeout(async () => {
      try {
        if (!existsSync(absPath)) return; // deletion event, not addition
        await processFile(absPath, options);
      } catch (err) {
        const componentName = deriveComponentName(absPath);
        const label = chalk.cyan(`[${componentName}]`);
        console.error(
          `${label} ${chalk.red("✗")} ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        inProgress.delete(absPath);
      }
    }, 300);
  });

  return new Promise((_, reject) => {
    watcher.on("error", reject);

    process.on("SIGINT", () => {
      watcher.close();
      console.log(chalk.dim("\n  stopped watching"));
      process.exit(0);
    });
  });
}
