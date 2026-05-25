import chalk from "chalk";
import { DEFAULT_MODEL } from "./generate.js";
import { SUPPORTED_EXTENSIONS } from "./image.js";

export interface CliArgs {
  imagePath: string;
  watchDir?: string;
  componentName?: string;
  outputPath?: string;
  model: string;
  noOpen: boolean;
}

export function die(message: string): never {
  console.error(chalk.red(`  ✗  ${message}`));
  process.exit(1);
}

export function printHelp(): void {
  console.log(`
${chalk.bold("s2c")} — Screenshot to React Component

${chalk.dim("Usage:")}
  s2c <image> [options]
  s2c --watch <dir> [options]

${chalk.dim("Options:")}
  --watch,  -w <dir>     Watch a directory and convert new images automatically
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
  s2c --watch ./screenshots --output ./src/components
`);
}

export function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);
  let imagePath = "";
  let watchDir: string | undefined;
  let componentName: string | undefined;
  let outputPath: string | undefined;
  let model = DEFAULT_MODEL;
  let noOpen = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--no-open") {
      noOpen = true;
    } else if (arg === "--watch" || arg === "-w") {
      watchDir = args[++i];
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

  if (!imagePath && !watchDir) return null;
  return { imagePath, watchDir, componentName, outputPath, model, noOpen };
}
