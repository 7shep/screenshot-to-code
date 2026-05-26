# Changelog

All notable changes to s2c are documented here.

## [1.4.0] — 2026-05-26

### VS Code Extension

A full sidebar panel that bundles the entire generation pipeline inside VS Code — no CLI install required.

**Install**

1. Open the `extension/` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. The **s2c** icon appears in the Activity Bar

To build a `.vsix` for distribution:
```bash
cd extension && npm install && npm run build && npx vsce package
```

**Features**

- **Drag-and-drop** or click-to-pick screenshots directly in the panel
- **Per-pass progress log** with live spinner — see each AI pass complete in real time
- **All generation options** available in the UI: animations, single-file mode, style preset, skip design system
- **Model selector** grouped by provider — switch between Gemini and Groq/Llama 4 models without touching settings
- **API Keys section** with ●/○ live status indicators — set or update Gemini and Groq keys directly in the panel (stored in VS Code SecretStorage, never in `settings.json`)
- **Component name override** — set a custom output name or leave blank to derive from the filename
- **Output folder picker** — browse to any directory using VS Code's native folder dialog
- **Design system path** — point at your component library or leave on auto-detect

**Workspace settings** (`.vscode/settings.json`):

```jsonc
{
  "s2c.componentsDir": "src/components",
  "s2c.outputDir": "",
  "s2c.defaultStyle": "tailwind",
  "s2c.defaultAnimate": false,
  "s2c.defaultSingleFile": false,
  "s2c.model": "gemini-2.5-flash"
}
```

### Bug fixes

- `isGroqModel` now uses an explicit prefix list (`llama`, `mixtral`, `gemma`, `whisper`, `deepseek`, `qwen`, `llava`) — previously `!startsWith("gemini")` incorrectly routed non-Gemini models like `gpt-4o` to Groq
- `generateComponentMultiFile` no longer swallows API errors — the blanket `try/catch` around `generateText` was silently returning `null` on auth failures and rate limits; API errors now propagate correctly
- `tryReadV3Tokens` in `tailwind.ts` falls back to `createRequire(fullPath)` when `import.meta.url` throws inside esbuild CJS bundles
- `flattenTokens` now handles Tailwind v3 array values (e.g. `fontFamily: ['Inter', 'sans-serif']`) instead of dropping them
- `detectUsedComponents` now escapes special regex characters in component names (e.g. `Form.Item`, `$Icon`) that previously caused `SyntaxError` at runtime

---

## [1.3.0] — 2026-05-26

### Groq support

Use Llama 4 models via Groq's OpenAI-compatible API. Groq offers a generous free tier with significantly higher rate limits than Gemini's free plan.

```bash
export GROQ_API_KEY=gsk_...
s2c ./screenshots/navbar.png --model meta-llama/llama-4-scout-17b-16e-instruct
```

**Available Groq models**

| Model | Notes |
|---|---|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Recommended — fast, vision-capable |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Higher quality, slower |

Provider is detected automatically from the model name — any model starting with `llama`, `mixtral`, `gemma`, `deepseek`, `qwen`, or `whisper` is routed to Groq. No flag needed.

> **Note:** Llama 4 models must be enabled in your Groq project at [console.groq.com/settings/project/limits](https://console.groq.com/settings/project/limits).

---

## [1.2.0] — 2026-05-26

### Design system context injection

s2c now scans your component library and Tailwind tokens before generating, so output reuses your existing components and design language instead of inventing new ones.

```
❯ s2c ./screenshots/dashboard.png

  ✓ image loaded
  ✓ design system loaded  (12 components, 24 color tokens)
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated (3 files)
  ✓ component used 4 design system components: Card, Button, Badge, Avatar
  ✓ wrote Dashboard.tsx
```

**Component scanning** — uses the TypeScript compiler (ts-morph) to extract exported component names, prop types, and JSDoc descriptions from your `.tsx` files. The model is instructed to import and use matching components instead of reimplementing them.

**Tailwind tokens** — reads color tokens from `tailwind.config.js` (v3) or CSS `@theme` blocks in `globals.css` (v4) and injects them into the prompt so the model uses your exact color scale.

**Auto-detection** — looks for components in these directories automatically (in order):
`src/components`, `components/`, `app/components/`, `packages/ui/src`, `packages/design-system/src`, `libs/ui/src`

**New flags**

| Flag | Description |
|---|---|
| `--components <dir>` | Explicit path to your component library |
| `--no-design-system` | Skip scanning entirely for a faster, blank-slate run |

---

## [1.1.0] — 2026-05-25

### Multi-file output (`--multi-file`)

Generate a full feature slice instead of a single component file:

```bash
s2c dashboard.png --multi-file
# writes Dashboard.tsx + useDashboard.ts + dashboard.types.ts
```

The AI produces three coordinated files in a single pass:

- **`ComponentName.tsx`** — the React component, importing from the hook and types files
- **`useComponentName.ts`** — a custom hook encapsulating all state and logic
- **`componentName.types.ts`** — shared TypeScript interfaces and types

Falls back to single-file mode automatically if the model output cannot be parsed into three parts.

Works with all existing flags: `--refine`, `--animate`, two-states mode, and `--watch`.

### Test coverage

110 tests across the full pipeline. New test suite covers the multi-file feature end-to-end:

- Correct parsing of all three output sections (`<types>`, `<hook>`, `<component>`)
- Graceful `null` return on missing tags or empty API response (triggers single-file fallback)
- Code-fence stripping on every generated file (prevents raw markdown leaking into `.ts` files)
- Prompt construction: analysis, interactions, `existingCode`, second image, component/hook/types names
- `deriveHookName` and `deriveTypesBaseName` naming helpers

---

## [1.0.0] — 2026-05-25

### What you can do now

**Turn any UI screenshot into a working React component in seconds.**

```bash
s2c dashboard.png
# writes Dashboard.tsx with real useState hooks, Tailwind classes, and lucide-react icons
```

### Core pipeline

s2c runs up to four sequential AI passes before writing a single line of code:

1. **Visual analysis** — structured JSON description of layout, colors, typography, spacing, and every visible component.
2. **Interaction analysis** — identifies every interactive element and describes its React behavior: what state it needs, what triggers it, what handler to wire up.
3. **Component generation** — produces a fully typed `.tsx` file using both analyses plus the screenshot image. Real `useState` hooks and event handlers, not static markup.
4. **Animation pass** (`--animate`) — optional fourth pass that layers Framer Motion onto the generated component: entrance animations, hover/tap feedback, `AnimatePresence` for conditional content, staggered list animations.

### Iteration modes

**Refinement mode** (`--refine <Component.tsx>`) — update an existing component to match a new screenshot. Loads the source file, sends it to the model alongside the new image, preserves structure and state logic, only changes what the screenshot requires. Overwrites the target file.

```bash
s2c new-navbar.png --refine src/components/Navbar.tsx
```

**Two-states mode** (`s2c before.png after.png`) — generate one component with toggle logic from two screenshots of the same UI in different states. A dedicated state-transition analysis pass figures out the trigger, the React state variables needed, and which elements appear/disappear — then generates a single component with the toggle already wired up. Works great for modals, drawers, dropdowns, and accordions.

```bash
s2c modal-closed.png modal-open.png
```

### Style presets (`--style`)

| Preset | Output |
|---|---|
| `tailwind` | Single `.tsx` with Tailwind classes (default) |
| `css-modules` | `.tsx` + companion `.module.css` |
| `styled-components` | Single `.tsx` using `styled-components` |

### Watch mode (`--watch`)

Drop images into a folder and get components automatically:

```bash
s2c --watch ./screenshots --output ./src/components
```

### All flags

| Flag | Description |
|---|---|
| `--animate` / `-a` | Add Framer Motion animations |
| `--style` / `-s` | Styling preset: `tailwind`, `css-modules`, `styled-components` |
| `--refine` / `-r` | Update an existing component (sends file to Gemini API) |
| `--watch` / `-w` | Watch a directory for new screenshots |
| `--name` / `-n` | Override the component name |
| `--output` / `-o` | Override the output path |
| `--model` / `-m` | Override the Gemini model (default: `gemini-2.5-flash`) |
| `--no-open` | Skip opening VS Code |

### Test coverage

90 tests across the full pipeline: image loading, argument parsing, all four AI passes, file writing, watch mode, and CSS Modules splitting.
