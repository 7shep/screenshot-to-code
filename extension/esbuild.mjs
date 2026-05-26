import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

// Plugin: resolve TypeScript NodeNext-style ".js" imports to their ".ts" source files.
// esbuild doesn't automatically try ".ts" when you import "./foo.js", so we intercept
// local relative imports ending in ".js" and redirect to ".ts" if the source exists.
const resolveJsToTs = {
  name: "resolve-js-to-ts",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, async (args) => {
      if (!args.path.startsWith(".") && !args.path.startsWith("/")) return;
      const tsPath = path.join(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      try {
        await fs.promises.access(tsPath);
        return { path: tsPath };
      } catch {
        return undefined;
      }
    });
  },
};

const baseConfig = {
  bundle: true,
  sourcemap: true,
  plugins: [resolveJsToTs],
};

// Extension host bundle — Node/CJS, vscode and ts-morph are externals.
// ts-morph is external so it doesn't balloon the bundle; it's loaded from
// node_modules at runtime, but only via a lazy import() in design-system.ts.
await esbuild.build({
  ...baseConfig,
  entryPoints: [path.join(__dirname, "src/extension.ts")],
  outfile: path.join(__dirname, "dist/extension.js"),
  platform: "node",
  format: "cjs",
  external: ["vscode", "ts-morph"],
});

// Webview bundle — browser/IIFE, no Node APIs.
await esbuild.build({
  ...baseConfig,
  entryPoints: [path.join(__dirname, "webview/panel.ts")],
  outfile: path.join(__dirname, "dist/panel.js"),
  platform: "browser",
  format: "iife",
});

console.log("extension build complete");
