import chalk from "chalk";
import { DEFAULT_MODEL } from "./generate.js";
import { SUPPORTED_EXTENSIONS } from "./image.js";

export type StylePreset = "tailwind" | "css-modules" | "styled-components";
export const STYLE_PRESETS: StylePreset[] = ["tailwind", "css-modules", "styled-components"];
export const DEFAULT_STYLE: StylePreset = "tailwind";

export interface CliArgs {
  imagePath: string;
  secondImagePath?: string;
  watchDir?: string;
  componentName?: string;
  outputPath?: string;
  model: string;
  noOpen: boolean;
  animate: boolean;
  style: StylePreset;
  refinePath?: string;
  singleFile: boolean;
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
  s2c <image1> <image2> [options]          Two-states mode
  s2c --watch <dir> [options]

${chalk.dim("Options:")}
  --watch,   -w <dir>    Watch a directory and convert new images automatically
  --animate, -a          Add Framer Motion animations (4th AI pass)
  --style,   -s <preset> Styling approach: tailwind | css-modules | styled-components  (default: tailwind)
  --refine,  -r <file>   Update an existing component to match the new screenshot (sends file contents to Gemini API)
  --single,  -1          Output a single .tsx file instead of the default 3-file feature slice
  --name,    -n <Name>   Override the component name  (default: derived from filename)
  --output,  -o <path>   Override the output file/dir  (default: next to the image)
  --model,   -m <id>     Override the AI model         (default: ${DEFAULT_MODEL})
  --no-open              Skip opening the file in VS Code
  --help,    -h          Show this help

${chalk.dim("Supported image formats:")}
  ${SUPPORTED_EXTENSIONS.join(", ")}

${chalk.dim("Examples:")}
  s2c ./screenshots/navbar.png
  s2c hero.jpg --name HeroSection --output ./src/components
  s2c ui.png --no-open --model gemini-2.0-flash
  s2c new-navbar.png --refine src/components/Navbar.tsx
  s2c closed.png open.png
  s2c --watch ./screenshots --output ./src/components
`);
}

export function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);
  let imagePath = "";
  let secondImagePath: string | undefined;
  let watchDir: string | undefined;
  let componentName: string | undefined;
  let outputPath: string | undefined;
  let model = DEFAULT_MODEL;
  let noOpen = false;
  let animate = false;
  let style: StylePreset = DEFAULT_STYLE;
  let refinePath: string | undefined;
  let singleFile = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--no-open") {
      noOpen = true;
    } else if (arg === "--single" || arg === "-1") {
      singleFile = true;
    } else if (arg === "--animate" || arg === "-a") {
      animate = true;
    } else if (arg === "--style" || arg === "-s") {
      const val = args[i + 1];
      if (!val || val.startsWith("-")) die(`--style requires a value: ${STYLE_PRESETS.join(" | ")}`);
      if (!STYLE_PRESETS.includes(val as StylePreset)) {
        die(`Unknown style preset "${val}". Valid options: ${STYLE_PRESETS.join(", ")}`);
      }
      style = val as StylePreset;
      i++;
    } else if (arg === "--refine" || arg === "-r") {
      const val = args[i + 1];
      if (!val || val.startsWith("-")) die("--refine requires a file path to an existing component");
      refinePath = val;
      i++;
    } else if (arg === "--watch" || arg === "-w") {
      const next = args[i + 1];
      watchDir = (next && !next.startsWith("-")) ? args[++i] : ".";
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
      const ext = arg.toLowerCase();
      if (SUPPORTED_EXTENSIONS.some(e => ext.endsWith(e))) {
        if (!imagePath) {
          imagePath = arg;
        } else if (!secondImagePath) {
          secondImagePath = arg;
        }
      } else {
        imagePath = arg;
      }
    } else {
      die(`Unknown flag: ${arg}`);
    }
  }

  if (!imagePath && !watchDir) return null;
  // --refine targets an existing file: multi-file generation would need to update all three files,
  // which isn't supported yet. Force single-file mode when refining.
  if (refinePath) singleFile = true;
  // Non-tailwind style presets produce a single output file by design.
  if (style !== "tailwind") singleFile = true;
  return { imagePath, secondImagePath, watchDir, componentName, outputPath, model, noOpen, animate, style, refinePath, singleFile };
}
