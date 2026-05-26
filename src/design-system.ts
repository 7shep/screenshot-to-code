import { existsSync } from "fs";
import { join, resolve } from "path";
import { extractTailwindTokens } from "./tailwind.js";
import type { ComponentInfo } from "./scanner.js";
import type { TokenMap } from "./tailwind.js";

export interface DesignSystemResult {
  context: string | null;
  componentCount: number;
  colorCount: number;
  /** Names of scanned components, for post-generation usage detection */
  componentNames: string[];
}

const COMPONENT_SCAN_LIMIT = 50;

const AUTO_DETECT_DIRS = [
  "src/components",
  "components",
  "app/components",
  "packages/ui/src",
  "packages/design-system/src",
  "libs/ui/src",
];

export function autoDetectComponentsDir(projectRoot: string): string | null {
  for (const dir of AUTO_DETECT_DIRS) {
    const full = join(projectRoot, dir);
    if (existsSync(full)) return full;
  }
  return null;
}

export async function buildDesignSystemContext(
  projectRoot: string,
  componentsDir?: string
): Promise<DesignSystemResult> {
  const dir = componentsDir
    ? resolve(componentsDir)
    : autoDetectComponentsDir(projectRoot);

  const [components, tokens] = await Promise.all([
    dir
      ? import("./scanner.js").then(({ scanComponents }) => scanComponents(dir))
      : Promise.resolve([] as ComponentInfo[]),
    extractTailwindTokens(projectRoot),
  ]);

  // Cap scan results on large monorepos
  const capped = components.slice(0, COMPONENT_SCAN_LIMIT);
  const colorEntries = Object.entries(tokens.colors ?? {});
  const spacingEntries = Object.entries(tokens.spacing ?? {});
  const fontEntries = Object.entries(tokens.fontFamily ?? {});

  if (capped.length === 0 && colorEntries.length === 0 && spacingEntries.length === 0) {
    return { context: null, componentCount: 0, colorCount: 0, componentNames: [] };
  }

  const lines: string[] = ["## Design System Context", ""];

  if (capped.length > 0) {
    lines.push("### Available Components");
    lines.push(
      "Prefer these components from the project's library over bare HTML elements. " +
      "Import them using their exact names."
    );
    for (const c of capped) {
      const propsStr = c.props
        .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
        .join(", ");
      const sig = `<${c.name}${propsStr ? ` (${propsStr})` : ""}>`;
      const doc = c.jsDoc ? ` — ${c.jsDoc}` : "";
      lines.push(`- \`${sig}\`${doc}`);
    }
    lines.push("");
  }

  if (colorEntries.length > 0) {
    if (tokens.source === "v4") {
      lines.push("### Tailwind Color Tokens (v4 CSS variables)");
      lines.push(
        "These are CSS custom properties defined in `@theme`. Reference them as " +
        "`text-[--color-<name>]` / `bg-[--color-<name>]` or via `color: var(--color-<name>)`."
      );
      for (const [name, value] of colorEntries) {
        lines.push(`- \`--color-${name}\` (${value})`);
      }
    } else {
      lines.push("### Tailwind Color Tokens (v3 custom colors)");
      lines.push(
        "These are custom colors from `tailwind.config.js`. Use them as standard Tailwind " +
        "utility classes: `text-<name>` / `bg-<name>` / `border-<name>`."
      );
      for (const [name, value] of colorEntries) {
        lines.push(`- \`${name}\` (${value}) → e.g. \`text-${name}\`, \`bg-${name}\``);
      }
    }
    lines.push("");
  }

  if (spacingEntries.length > 0) {
    lines.push("### Spacing Tokens");
    for (const [name, value] of spacingEntries) {
      lines.push(`- \`--spacing-${name}\` (${value})`);
    }
    lines.push("");
  }

  if (fontEntries.length > 0) {
    lines.push("### Font Family Tokens");
    for (const [name, value] of fontEntries) {
      lines.push(`- \`--font-${name}\` (${value})`);
    }
    lines.push("");
  }

  lines.push(
    "IMPORTANT: When generating the component, prefer the design system components listed above " +
    "over generic HTML elements. Use the color token CSS variables listed above instead of " +
    "arbitrary hex values or standard Tailwind color names."
  );

  return {
    context: lines.join("\n"),
    componentCount: capped.length,
    colorCount: colorEntries.length,
    componentNames: capped.map((c) => c.name),
  };
}

/** Extract component names used in generated TSX (post-generation signal for status line) */
export function detectUsedComponents(code: string, componentNames: string[]): string[] {
  return componentNames.filter((name) => {
    // Escape special regex chars so names like Form.Item or $Icon don't throw
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<${escaped}[\\s/>]`).test(code);
  });
}
