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
import { loadImage, deriveComponentName, SUPPORTED_EXTENSIONS } from "./image.js";
import { generateComponent, DEFAULT_MODEL } from "./generate.js";
import { writeComponent, openInEditor } from "./output.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  imagePath: string;
  componentName?: string;
  outputPath?: string;
  model: string;
  noOpen: boolean;
}

function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2); // drop "node" + script path
  let imagePath = "";
  let componentName: string | undefined;
  let outputPath: string | undefined;
  let model = DEFAULT_MODEL;
  let noOpen = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--no-open") {
      noOpen = true;
    } else if (arg === "--name" || arg === "-n") {
      componentName = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      outputPath = args[++i];
    } else if (arg === "--model" || arg === "-m") {
      model = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      imagePath = arg;
    } else {
      die(`Unknown flag: ${arg}`);
    }
  }

  if (!imagePath) return null;
  return { imagePath, componentName, outputPath, model, noOpen };
}

function printHelp(): void {
  console.log(`
${chalk.bold("s2c")} — Screenshot to React Component

${chalk.dim("Usage:")}
  s2c <image> [options]

${chalk.dim("Options:")}
  --name,   -n <Name>    Override the component name  (default: derived from filename)
  --output, -o <path>    Override the output file/dir  (default: next to the image)
  --model,  -m <id>      Override the AI model         (default: ${DEFAULT_MODEL})
  --no-open              Skip opening the file in VS Code
  --help,   -h           Show this help

${chalk.dim("Supported image formats:")}
  ${SUPPORTED_EXTENSIONS.join(", ")}

${chalk.dim("Examples:")}
  s2c ./screenshots/navbar.png
  s2c hero.jpg --name HeroSection --output ./src/components
  s2c ui.png --no-open --model gemini-2.0-flash
`);
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function die(message: string): never {
  console.error(chalk.red(`  ✗  ${message}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  // No arguments — show help and exit
  if (!parsed) {
    printHelp();
    process.exit(0);
  }

  const { imagePath, componentName: nameOverride, outputPath, model, noOpen } = parsed;

  // --- Validate image path ---
  const absoluteImagePath = resolve(imagePath);
  if (!existsSync(absoluteImagePath)) {
    die(`File not found: ${imagePath}`);
  }

  const ext = extname(absoluteImagePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    die(`Unsupported file type "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }

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

  const componentName = nameOverride ?? deriveComponentName(absoluteImagePath);
  const imageDir = dirname(absoluteImagePath);

  // --- Step 1: Read image ---
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

  // --- Step 2: Call Gemini ---
  spinner.start(chalk.dim(`sending to gemini (${model})...`));
  let code: string;
  try {
    code = await generateComponent({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      componentName,
      model,
    });
  } catch (err) {
    spinner.fail(chalk.red("API call failed"));
    if (err instanceof Error) {
      // Surface useful details for common errors
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
  spinner.succeed(chalk.dim("component generated"));

  // --- Step 3: Write file ---
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

  // --- Step 4: Open in VS Code ---
  if (!noOpen) {
    openInEditor(filePath);
    console.log(`  ${chalk.green("✓")} opened in VS Code`);
  }
}

main().catch((err) => {
  console.error(chalk.red("Unexpected error:"), err);
  process.exit(1);
});
