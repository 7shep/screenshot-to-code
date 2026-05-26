import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postcss from "postcss";

export interface TokenMap {
  colors?: Record<string, string>;
  spacing?: Record<string, string>;
  fontFamily?: Record<string, string>;
  /** Whether tokens were read from a v4 @theme block or a v3 config file */
  source?: "v4" | "v3";
}

export async function extractTailwindTokens(projectRoot: string): Promise<TokenMap> {
  const v4 = await tryReadV4Tokens(projectRoot);
  if (v4 !== null) return v4;

  const v3 = await tryReadV3Tokens(projectRoot);
  if (v3 !== null) return v3;

  return {};
}

async function tryReadV4Tokens(root: string): Promise<TokenMap | null> {
  const candidates = [
    "src/app/globals.css",
    "src/globals.css",
    "app/globals.css",
    "globals.css",
  ];

  for (const candidate of candidates) {
    const fullPath = join(root, candidate);
    if (!existsSync(fullPath)) continue;

    const css = readFileSync(fullPath, "utf-8");
    const ast = postcss.parse(css);

    let foundThemeBlock = false;
    const tokens: TokenMap = {};

    ast.walk((node) => {
      if (node.type === "atrule" && node.name === "theme") {
        foundThemeBlock = true;
        node.walk((child) => {
          if (child.type !== "decl") return;
          if (child.prop.startsWith("--color-")) {
            const tokenName = child.prop.slice("--color-".length);
            tokens.colors = tokens.colors ?? {};
            tokens.colors[tokenName] = child.value;
          } else if (child.prop.startsWith("--spacing-")) {
            const tokenName = child.prop.slice("--spacing-".length);
            tokens.spacing = tokens.spacing ?? {};
            tokens.spacing[tokenName] = child.value;
          } else if (child.prop.startsWith("--font-")) {
            const tokenName = child.prop.slice("--font-".length);
            tokens.fontFamily = tokens.fontFamily ?? {};
            tokens.fontFamily[tokenName] = child.value;
          }
        });
      }
    });

    // If we found a @theme block this is a v4 project — return even if empty
    if (foundThemeBlock) return { ...tokens, source: "v4" };
  }

  return null;
}

async function tryReadV3Tokens(root: string): Promise<TokenMap | null> {
  // Only .js and .cjs — .ts requires a transpiler subprocess which is out of scope for v1.2
  const candidates = ["tailwind.config.js", "tailwind.config.cjs"];

  for (const candidate of candidates) {
    const fullPath = join(root, candidate);
    if (!existsSync(fullPath)) continue;

    try {
      // createRequire needs a valid file URL or path.
      // In native ESM, import.meta.url is available.
      // In esbuild CJS bundles, import.meta.url throws — fall back to a require rooted
      // at the config file itself so relative requires inside it resolve correctly.
      let requireFn: NodeRequire;
      try {
        requireFn = createRequire(import.meta.url);
      } catch {
        requireFn = createRequire(fullPath);
      }

      // Clear require cache so re-runs pick up changes
      delete requireFn.cache[requireFn.resolve(fullPath)];
      const mod = requireFn(fullPath);
      const config = mod?.default ?? mod;
      const theme = config?.theme?.extend ?? config?.theme ?? {};

      return {
        colors: flattenTokens(theme.colors ?? {}),
        spacing: flattenTokens(theme.spacing ?? {}),
        fontFamily: flattenTokens(theme.fontFamily ?? {}),
        source: "v3",
      };
    } catch {
      continue;
    }
  }

  return null;
}

/** Flatten { blue: { 500: '#3b82f6' } } → { 'blue-500': '#3b82f6' } */
function flattenTokens(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === "string") {
      result[fullKey] = value;
    } else if (Array.isArray(value)) {
      // e.g. fontFamily: ['Inter', 'sans-serif'] → 'Inter, sans-serif'
      result[fullKey] = (value as unknown[]).filter((v) => typeof v === "string").join(", ");
    } else if (value && typeof value === "object") {
      Object.assign(result, flattenTokens(value as Record<string, unknown>, fullKey));
    }
  }

  return result;
}
