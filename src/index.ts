#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
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
import { analyzeScreenshot, analyzeInteractions, analyzeStateTransition, generateComponent, generateComponentMultiFile, animateComponent, isGroqModel } from "./generate.js";
import type { ImagePayload } from "./generate.js";
import { writeComponent, openInEditor } from "./output.js";
import { buildDesignSystemContext, autoDetectComponentsDir, detectUsedComponents } from "./design-system.js";
import { startWatch } from "./watch.js";

function handleApiError(err: unknown): never {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("authentication")) {
      die("Authentication failed — check your API key (GEMINI_API_KEY or GROQ_API_KEY).");
    }
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit") || msg.includes("rate_limit")) {
      die("Rate limited — please wait and try again, or switch models with --model.");
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

  const { imagePath, secondImagePath, watchDir, componentName: nameOverride, outputPath, model, noOpen, animate, style, refinePath, singleFile, componentsDir, noDesignSystem } = parsed;

  // --- Validate API key ---
  if (isGroqModel(model)) {
    if (!process.env.GROQ_API_KEY) {
      die(
        "GROQ_API_KEY is not set.\n" +
        chalk.dim(
          "    Set it with: export GROQ_API_KEY=gsk_...\n" +
          "    Get a key at: https://console.groq.com/keys"
        )
      );
    }
  } else if (!process.env.GEMINI_API_KEY) {
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
      await startWatch({ watchDir, outputPath, model, noOpen, animate, style, singleFile });
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
  const imageDir = dirname(absoluteImagePath);
  const projectRoot = process.cwd();

  const spinner = ora({ color: "cyan" });

  // --- Load primary image ---
  spinner.start(chalk.dim("reading image..."));
  let imageData: ImagePayload;
  try {
    imageData = loadImage(absoluteImagePath);
  } catch (err) {
    spinner.fail(chalk.red("failed to read image"));
    die(err instanceof Error ? err.message : String(err));
  }

  // --- Load second image (two-states mode) ---
  let secondImageData: ImagePayload | undefined;
  if (secondImagePath) {
    const absSecond = resolve(secondImagePath);
    if (!existsSync(absSecond)) die(`File not found: ${secondImagePath}`);
    try {
      secondImageData = loadImage(absSecond);
    } catch (err) {
      spinner.fail(chalk.red("failed to read second image"));
      die(err instanceof Error ? err.message : String(err));
    }
    spinner.succeed(chalk.dim("images loaded (2)"));
  } else {
    spinner.succeed(chalk.dim("image loaded"));
  }

  // --- Design system context (v1.2) ---
  let designContext: string | undefined;
  let dsComponentNames: string[] = [];
  let dsColorCount = 0;

  if (!noDesignSystem) {
    // Validate explicit --components dir exists
    if (componentsDir && !existsSync(resolve(componentsDir))) {
      spinner.stop();
      console.error(chalk.red(`  ✗  design system failed  --components: directory not found: ${componentsDir}`));
      process.exit(1);
    }

    spinner.start(chalk.dim("loading design system..."));
    try {
      const dsResult = await buildDesignSystemContext(projectRoot, componentsDir);
      designContext = dsResult.context ?? undefined;
      dsColorCount = dsResult.colorCount;
      dsComponentNames = dsResult.componentNames;

      spinner.stop();
      if (!designContext) {
        const detectedDir = componentsDir ?? autoDetectComponentsDir(projectRoot);
        if (!detectedDir) {
          console.log(`  ${chalk.yellow("⚠")} ${chalk.dim("design system skipped")}  ${chalk.dim("(no components dir found — use --components <dir> to enable)")}`);
        } else {
          console.log(`  ${chalk.yellow("⚠")} ${chalk.dim("design system skipped")}  ${chalk.dim("(no components or tokens found)")}`);
        }
      } else {
        const parts: string[] = [];
        if (dsResult.componentCount > 0) parts.push(`${dsResult.componentCount} component${dsResult.componentCount !== 1 ? "s" : ""}`);
        if (dsColorCount > 0) parts.push(`${dsColorCount} color token${dsColorCount !== 1 ? "s" : ""}`);
        const suffix = parts.length ? `  ${chalk.dim(`(${parts.join(", ")})`)}`  : "";
        console.log(`  ${chalk.green("✓")} ${chalk.dim("design system loaded")}${suffix}`);
      }
    } catch (err) {
      spinner.warn(chalk.yellow("design system load failed — continuing without it"));
      designContext = undefined;
    }
  }

  // --- Validate --refine + --style compatibility ---
  if (refinePath && style !== "tailwind") {
    die(`--refine only supports Tailwind styling. Remove --style ${style} or omit --refine.`);
  }

  // --- Load existing component (refinement mode) ---
  let existingCode: string | undefined;
  if (refinePath) {
    const absRefine = resolve(refinePath);
    if (!existsSync(absRefine)) die(`Refine target not found: ${refinePath}`);
    spinner.start(chalk.dim("loading existing component..."));
    try {
      existingCode = readFileSync(absRefine, "utf-8");
    } catch (err) {
      spinner.fail(chalk.red("failed to read existing component"));
      die(`Could not read ${refinePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    spinner.succeed(chalk.dim("existing component loaded"));
  }

  spinner.start(chalk.dim(`analysing screenshot (${model})...`));
  let analysis: string;
  try {
    analysis = await analyzeScreenshot({ base64: imageData.base64, mediaType: imageData.mediaType, model });
  } catch (err) {
    spinner.fail(chalk.red("analysis failed"));
    handleApiError(err);
  }
  spinner.succeed(chalk.dim("screenshot analysed"));

  // --- State transition analysis (two-states mode) ---
  let stateTransition: string | undefined;
  if (secondImageData) {
    spinner.start(chalk.dim("analysing state transition..."));
    try {
      stateTransition = await analyzeStateTransition({ image1: imageData, image2: secondImageData, model });
    } catch (err) {
      spinner.fail(chalk.red("state transition analysis failed"));
      handleApiError(err);
    }
    spinner.succeed(chalk.dim("state transition analysed"));
  }

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

  const generationLabel = existingCode ? "refining component..." : "generating component...";
  spinner.start(chalk.dim(generationLabel));

  let written: { tsx: string; css?: string; hook?: string; types?: string };

  if (!singleFile) {
    // Multi-file mode: single Gemini pass → types + hook + component
    let multiResult: Awaited<ReturnType<typeof generateComponentMultiFile>>;
    try {
      multiResult = await generateComponentMultiFile({
        base64: imageData.base64,
        mediaType: imageData.mediaType,
        componentName,
        model,
        analysis,
        interactions,
        existingCode,
        secondImage: secondImageData,
        stateTransition,
        designContext,
      });
    } catch (err) {
      spinner.fail(chalk.red("generation failed"));
      handleApiError(err);
    }

    if (!multiResult) {
      // Parse failed — fall back to single-file mode with a warning
      spinner.warn(chalk.yellow("multi-file parse failed, falling back to single-file"));
      multiResult = null;
    }

    if (multiResult) {
      if (animate) {
        spinner.text = chalk.dim("adding animations...");
        try {
          multiResult.tsx = await animateComponent({ code: multiResult.tsx, interactions, model });
        } catch (err) {
          spinner.fail(chalk.red("animation pass failed"));
          handleApiError(err);
        }
      }
      spinner.succeed(chalk.dim(existingCode ? "component refined (3 files)" : "component generated (3 files)"));
      if (designContext && dsComponentNames.length > 0) {
        const used = detectUsedComponents(multiResult.tsx, dsComponentNames);
        if (used.length > 0) {
          console.log(`  ${chalk.green("✓")} ${chalk.dim(`component used ${used.length} design system component${used.length !== 1 ? "s" : ""}: ${used.join(", ")}`)}`);
        } else {
          console.log(`  ${chalk.dim("⚑  design system loaded but no components matched this screenshot")}`);
        }
      }
      spinner.start(chalk.dim("writing files..."));
      try {
        written = writeComponent({
          code: multiResult.tsx,
          hook: multiResult.hook,
          types: multiResult.types,
          imageDir,
          componentName,
          outputOverride: outputPath,
        });
      } catch (err) {
        spinner.fail(chalk.red("failed to write files"));
        die(err instanceof Error ? err.message : String(err));
      }
      spinner.stop();
      console.log(`  ${chalk.green("✓")} wrote ${chalk.bold(written.tsx)}`);
      if (written.hook) console.log(`  ${chalk.green("✓")} wrote ${chalk.bold(written.hook)}`);
      if (written.types) console.log(`  ${chalk.green("✓")} wrote ${chalk.bold(written.types)}`);
      if (!noOpen) {
        openInEditor(written.tsx);
        console.log(`  ${chalk.green("✓")} opened in VS Code`);
      }
      return;
    }
    // Fall through to single-file mode
  }

  // Single-file mode (--single, --refine, non-tailwind styles, or multi-file fallback)
  let generated: { code: string; css?: string };
  try {
    generated = await generateComponent({
      base64: imageData.base64,
      mediaType: imageData.mediaType,
      componentName,
      model,
      analysis,
      interactions,
      style,
      existingCode,
      secondImage: secondImageData,
      stateTransition,
      designContext,
    });
  } catch (err) {
    spinner.fail(chalk.red("generation failed"));
    handleApiError(err);
  }
  spinner.succeed(chalk.dim(existingCode ? "component refined" : "component generated"));
  if (designContext && dsComponentNames.length > 0) {
    const used = detectUsedComponents(generated.code, dsComponentNames);
    if (used.length > 0) {
      console.log(`  ${chalk.green("✓")} ${chalk.dim(`component used ${used.length} design system component${used.length !== 1 ? "s" : ""}: ${used.join(", ")}`)}`);
    } else {
      console.log(`  ${chalk.dim("⚑  design system loaded but no components matched this screenshot")}`);
    }
  }

  if (animate) {
    spinner.start(chalk.dim("adding animations..."));
    try {
      generated.code = await animateComponent({ code: generated.code, interactions, model });
    } catch (err) {
      spinner.fail(chalk.red("animation pass failed"));
      handleApiError(err);
    }
    spinner.succeed(chalk.dim("animations added"));
  }

  spinner.start(chalk.dim("writing component..."));
  try {
    written = writeComponent({
      code: generated.code,
      css: generated.css,
      imageDir,
      componentName,
      outputOverride: outputPath ?? (refinePath ? resolve(refinePath) : undefined),
    });
  } catch (err) {
    spinner.fail(chalk.red("failed to write file"));
    die(err instanceof Error ? err.message : String(err));
  }
  spinner.succeed(`${chalk.green("✓")} wrote ${chalk.bold(written.tsx)}`);
  if (written.css) console.log(`  ${chalk.green("✓")} wrote ${chalk.bold(written.css)}`);

  if (!noOpen) {
    openInEditor(written.tsx);
    console.log(`  ${chalk.green("✓")} opened in VS Code`);
  }
}

main().catch((err) => {
  console.error(chalk.red("Unexpected error:"), err);
  process.exit(1);
});
