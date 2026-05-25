#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { dirname, join, resolve, extname } from "path";

// Load .env from cwd (project-local / global install usage), then fall back
// to the directory that contains this package so `npm install -g .` + a .env
// in the project root both work.
loadEnv();
loadEnv({ path: join(dirname(dirname(fileURLToPath(import.meta.url))), ".env") });

import chalk from "chalk";
import ora from "ora";
import { parseArgs, die, printHelp } from "./args.js";
import { loadImage, deriveComponentName, SUPPORTED_EXTENSIONS } from "./image.js";
import { analyzeScreenshot, analyzeInteractions, generateComponent, animateComponent } from "./generate.js";
import { writeComponent, openInEditor } from "./output.js";
import { startWatch } from "./watch.js";

function handleApiError(err: unknown): never {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("authentication")) {
      die("Authentication failed — check your GEMINI_API_KEY.");
    }
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit")) {
      die("Rate limited by Gemini API — please wait and try again.");
    }
    die(msg);
  }
  die(String(err));
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed) {
    printHelp();
    process.exit(0);
  }

  const { imagePath, watchDir, componentName: nameOverride, outputPath, model, noOpen, animate } = parsed;

  // --- Validate API key ---
  if (!process.env.GEMINI_API_KEY) {
    die(
      "GEMINI_API_KEY is not set.\n" +
      chalk.dim(
        "    Set it with: export GEMINI_API_KEY=AIza...\n" +
        "    Get a key at: https://aistudio.google.com/apikey"
      )
    );
  }

  // --- Watch mode ---
  if (watchDir) {
    try {
      await startWatch({ watchDir, outputPath, model, noOpen, animate });
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // --- Validate image path ---
  const absoluteImagePath = resolve(imagePath);
  if (!existsSync(absoluteImagePath)) {
    die(`File not found: ${imagePath}`);
  }

  const ext = extname(absoluteImagePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    die(`Unsupported file type "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }

  const componentName = nameOverride ?? deriveComponentName(absoluteImagePath);
  const imageDir = process.cwd();

  const spinner = ora({ color: "cyan" });

  spinner.start(chalk.dim("reading image..."));
  let imageData;
  try {
    imageData = loadImage(absoluteImagePath);
  } catch (err) {
    spinner.fail(chalk.red("failed to read image"));
    die(err instanceof Error ? err.message : String(err));
  }
  spinner.succeed(chalk.dim("image loaded"));

  spinner.start(chalk.dim(`analysing screenshot (${model})...`));
  let analysis: string;
  try {
    analysis = await analyzeScreenshot({ base64: imageData.base64, mediaType: imageData.mediaType, model });
  } catch (err) {
    spinner.fail(chalk.red("analysis failed"));
    handleApiError(err);
  }
  spinner.succeed(chalk.dim("screenshot analysed"));

  spinner.start(chalk.dim("analysing interactions..."));
  let interactions: string;
  try {
    interactions = await analyzeInteractions({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      analysis,
      model,
    });
  } catch (err) {
    spinner.fail(chalk.red("interaction analysis failed"));
    handleApiError(err);
  }
  spinner.succeed(chalk.dim("interactions analysed"));

  spinner.start(chalk.dim("generating component..."));
  let code: string;
  try {
    code = await generateComponent({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      componentName,
      model,
      analysis,
      interactions,
    });
  } catch (err) {
    spinner.fail(chalk.red("generation failed"));
    handleApiError(err);
  }
  spinner.succeed(chalk.dim("component generated"));

  if (animate) {
    spinner.start(chalk.dim("adding animations..."));
    try {
      code = await animateComponent({ code, interactions, model });
    } catch (err) {
      spinner.fail(chalk.red("animation pass failed"));
      handleApiError(err);
    }
    spinner.succeed(chalk.dim("animations added"));
  }

  spinner.start(chalk.dim("writing component..."));
  let filePath: string;
  try {
    filePath = writeComponent({
      code,
      imageDir,
      componentName,
      outputOverride: outputPath,
    });
  } catch (err) {
    spinner.fail(chalk.red("failed to write file"));
    die(err instanceof Error ? err.message : String(err));
  }
  spinner.succeed(`${chalk.green("✓")} wrote ${chalk.bold(filePath)}`);

  if (!noOpen) {
    openInEditor(filePath);
    console.log(`  ${chalk.green("✓")} opened in VS Code`);
  }
}

main().catch((err) => {
  console.error(chalk.red("Unexpected error:"), err);
  process.exit(1);
});
