import { watch, existsSync } from "fs";
import { resolve, extname, dirname } from "path";
import chalk from "chalk";
import { SUPPORTED_EXTENSIONS, loadImage, deriveComponentName } from "./image.js";
import { analyzeScreenshot, generateComponent } from "./generate.js";
import { writeComponent, openInEditor } from "./output.js";

export interface WatchOptions {
  watchDir: string;
  outputPath?: string;
  model: string;
  noOpen: boolean;
}

export async function processFile(absPath: string, options: WatchOptions): Promise<void> {
  const { outputPath, model, noOpen } = options;
  const componentName = deriveComponentName(absPath);
  const imageDir = dirname(absPath);
  const label = chalk.cyan(`[${componentName}]`);

  console.log(`${label} ${chalk.dim("reading image...")}`);
  const imageData = loadImage(absPath);

  console.log(`${label} ${chalk.dim(`analysing screenshot (${model})...`)}`);
  const analysis = await analyzeScreenshot({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    model,
  });

  console.log(`${label} ${chalk.dim("generating component...")}`);
  const code = await generateComponent({
    base64: imageData.base64,
    mediaType: imageData.mediaType,
    componentName,
    model,
    analysis,
  });

  const filePath = writeComponent({ code, imageDir, componentName, outputOverride: outputPath });
  console.log(`${label} ${chalk.green("✓")} wrote ${chalk.bold(filePath)}`);

  if (!noOpen) {
    openInEditor(filePath);
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
    if (!existsSync(absPath)) return; // deletion event, not addition

    if (inProgress.has(absPath)) return;
    inProgress.add(absPath);

    // Brief delay so the file is fully written before we read it
    setTimeout(async () => {
      try {
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
