# s2c — Screenshot to Code

Turn a UI screenshot into a clean, interactive React TypeScript component using a multi-pass AI pipeline. Available as a **VS Code extension** (drag-and-drop panel) or a **CLI tool**.

```
❯ s2c ./screenshots/navbar.png

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated (3 files)
  ✓ wrote Navbar.tsx
  ✓ wrote useNavbar.ts
  ✓ wrote navbar.types.ts
  ✓ opened in VS Code

❯ s2c ./screenshots/navbar.png --animate

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated (3 files)
  ✓ animations added
  ✓ wrote Navbar.tsx
  ✓ wrote useNavbar.ts
  ✓ wrote navbar.types.ts
  ✓ opened in VS Code

❯ s2c ./screenshots/navbar.png --single

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated
  ✓ wrote Navbar.tsx
  ✓ opened in VS Code

❯ s2c new-navbar.png --refine src/components/Navbar.tsx

  ✓ image loaded
  ✓ existing component loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component refined
  ✓ wrote src/components/Navbar.tsx
  ✓ opened in VS Code

❯ s2c closed.png open.png

  ✓ images loaded (2)
  ✓ screenshot analysed
  ✓ state transition analysed
  ✓ interactions analysed
  ✓ component generated (3 files)
  ✓ wrote Closed.tsx
  ✓ wrote useClosed.ts
  ✓ wrote closed.types.ts
  ✓ opened in VS Code
```

## Requirements

- Node.js ≥ 18
- A Gemini API key (see [API Key](#api-key))

## Install

```bash
# 1. Clone the repo
git clone https://github.com/your-username/screenshot-to-code
cd screenshot-to-code

# 2. Install dependencies and build
npm install
npm run build

# 3. Install globally so `s2c` is available anywhere
npm install -g .
```

After this, `s2c` will work from any directory.

## API Key

Create a `.env` file in the project root with your key:

```
GEMINI_API_KEY=AIza...
```

The tool picks this up automatically. You can also export it in your shell instead:

```bash
export GEMINI_API_KEY=AIza...
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Usage

```bash
# Convert a single screenshot
s2c <image> [options]

# Two-states mode — generate one component with toggle logic
s2c <image1> <image2> [options]

# Refinement mode — update an existing component to match a new screenshot
s2c <image> --refine <Component.tsx> [options]

# Watch a directory for new screenshots
s2c --watch <dir> [options]
```

### Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--watch <dir>` | `-w` | Watch a directory and convert new images automatically | — |
| `--animate` | `-a` | Add Framer Motion animations (4th AI pass) | — |
| `--style <preset>` | `-s` | Styling approach: `tailwind`, `css-modules`, `styled-components` | `tailwind` |
| `--refine <file>` | `-r` | Update an existing component to match the new screenshot (sends file contents to Gemini API) | — |
| `--single` | `-1` | Output a single `.tsx` file instead of the default 3-file feature slice | — |
| `--name <Name>` | `-n` | Override the component name | Derived from filename |
| `--output <path>` | `-o` | Output file or directory | Current directory |
| `--model <id>` | `-m` | Use a different AI model | `gemini-2.5-flash` |
| `--components <dir>` | | Component library directory for design system context injection | Auto-detected |
| `--no-design-system` | | Skip component and Tailwind context injection entirely | — |
| `--no-open` | | Skip opening VS Code | — |
| `--help` | `-h` | Show help | — |

### Supported image formats

`.png`, `.jpg`, `.jpeg`, `.webp`

## Examples

```bash
# Basic — writes Navbar.tsx next to the image and opens it
s2c ./screenshots/navbar.png

# Custom component name and output directory
s2c hero.jpg --name HeroSection --output ./src/components

# Use a higher quality model
s2c dashboard.png --model gemini-2.5-pro

# Generate without opening VS Code
s2c button.png --no-open

# Write to a specific file path
s2c button.png --output ./src/components/Button.tsx

# Add Framer Motion animations
s2c navbar.png --animate

# Use CSS Modules instead of Tailwind (writes Navbar.tsx + Navbar.module.css)
s2c navbar.png --style css-modules

# Use styled-components
s2c navbar.png --style styled-components

# Full pipeline — custom name, output dir, CSS modules
s2c hero.png --name HeroSection --output ./src/components --style css-modules

# Refinement — update an existing component to match a new screenshot
s2c new-navbar.png --refine src/components/Navbar.tsx

# Two-states — generate one component with toggle logic from two states
s2c modal-closed.png modal-open.png

# Combine: refine + animate
s2c new-design.png --refine src/components/Hero.tsx --animate

# Design system — point at your component library explicitly
s2c dashboard.png --components ./packages/ui/src

# Skip design system injection (faster, blank-slate output)
s2c dashboard.png --no-design-system
```

## Design System Context (v1.2)

s2c can scan your component library and Tailwind tokens before generating, so the output reuses your existing components and design language instead of inventing new ones.

```
❯ s2c ./screenshots/dashboard.png

  ✓ image loaded
  ✓ design system loaded  (12 components, 24 color tokens)
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated (3 files)
  ✓ component used 4 design system components: Card, Button, Badge, Avatar
  ✓ wrote Dashboard.tsx
  ...
```

**Component scanning** — uses the TypeScript compiler to extract exported component names, prop types, and JSDoc descriptions from your `.tsx` files.

**Tailwind tokens** — reads color tokens from `tailwind.config.js` (v3) or CSS `@theme` blocks in `globals.css` (v4) and injects them into the prompt so the model uses your exact color scale.

**Auto-detection** — s2c looks for components in these directories automatically (in order):
`src/components`, `components/`, `app/components/`, `packages/ui/src`, `packages/design-system/src`, `libs/ui/src`

Override with `--components <dir>` or opt out entirely with `--no-design-system`.

## Watch Mode

Watch mode monitors a directory and automatically converts any new image dropped into it.

```bash
s2c --watch ./screenshots --output ./src/components
s2c --watch ./screenshots --output ./src/components --animate
```

```
◉ watching /screenshots
  → output: /src/components
  Press Ctrl+C to stop

[Navbar] reading image...
[Navbar] analysing screenshot (gemini-2.5-flash)...
[Navbar] analysing interactions...
[Navbar] generating component...
[Navbar] ✓ wrote /src/components/Navbar.tsx

[HeroBanner] reading image...
...
```

Each new image gets its own component name derived from the filename. Multiple images can land in the folder at the same time — each is processed independently. Press `Ctrl+C` to stop.

`--output` is optional; without it, components are written to the directory you ran the command from.

## How it works

s2c runs up to four AI passes on every screenshot before writing a single line of code:

1. **Visual analysis** — the model inspects the screenshot and produces a structured description of the layout, colour palette, typography, spacing, background, and every UI component visible.
2. **Interaction analysis** — identifies every interactive element (buttons, inputs, tabs, toggles, forms) and describes exactly what each one should do: what state it needs, what triggers it, and what behaviour to implement.
3. **Component generation** — the model receives the image alongside both analyses and generates a fully typed `.tsx` file with real `useState` hooks and handlers wired up, Tailwind classes, and `lucide-react` icons.
4. **Animation pass** *(optional, `--animate`)* — takes the generated component and layers in Framer Motion: entrance animations, hover and tap feedback on interactive elements, `AnimatePresence` for conditionally rendered content, and staggered list animations. Uses the interaction analysis to target the right elements.

**Refinement mode** (`--refine`) adds a "load existing component" step before the pipeline and swaps the generation prompt for an update prompt — the model preserves structure, state, and handlers, only changing what the new screenshot requires. Overwrites the target file by default.

**Two-states mode** (two positional images) inserts a dedicated state-transition pass between visual and interaction analysis. The model identifies what user action triggers the transition, what elements appear/disappear, and what React state variables are needed — then generates one component with the toggle already wired up.

This pipeline is what separates s2c from pasting a screenshot into a chat window — you get a component that actually works and moves, not just one that looks right.

## Style Presets

Control the styling approach with `--style`:

| Preset | Output | Notes |
|---|---|---|
| `tailwind` | Single `.tsx` | Default. Tailwind CSS classes, `cn()` helper, `lucide-react` icons. |
| `css-modules` | `.tsx` + `.module.css` | Companion CSS file written alongside the component. |
| `styled-components` | Single `.tsx` | Requires `styled-components` installed in your project (`npm i styled-components`). |

## Models

The default model is `gemini-2.5-flash`. Swap to any vision-capable model with `--model`.

### Gemini (requires `GEMINI_API_KEY`)

| Model | Notes |
|---|---|
| `gemini-2.5-flash` | Default. Fast and capable. |
| `gemini-2.5-pro` | Slower, higher quality. |
| `gemini-2.0-flash` | Previous generation flash. |

### Groq (requires `GROQ_API_KEY`)

Groq offers a generous free tier with much higher rate limits than Gemini's free plan. Get a key at [console.groq.com/keys](https://console.groq.com/keys).

| Model | Notes |
|---|---|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Recommended. Fast, vision-capable. |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Higher quality, slower. |

> **Note:** Llama 4 models must be enabled in your Groq project before use.
> Visit [console.groq.com/settings/project/limits](https://console.groq.com/settings/project/limits) to enable them.

```bash
# Set your Groq key
export GROQ_API_KEY=gsk_...

# Use a Groq model
s2c ./screenshots/navbar.png --model meta-llama/llama-4-scout-17b-16e-instruct
```

s2c detects the provider from the model name — any model starting with `llama`, `mixtral`, `gemma`, `deepseek`, `qwen`, or `whisper` is routed to Groq automatically.

## VS Code Extension (v1.4)

The extension bundles the full generation pipeline — no CLI install required. Drop a screenshot onto the panel and get a component without leaving VS Code.

### Install

**Step 1 — build the `.vsix`**

```bash
cd extension
npm install
npm run build
npm install -g @vscode/vsce   # one-time
vsce package
# → produces s2c-vscode-1.4.0.vsix
```

**Step 2 — install in VS Code**

```bash
code --install-extension extension/s2c-vscode-1.4.0.vsix
```

Or via the command palette: `Extensions: Install from VSIX...` → select the file.

Reload VS Code. The **s2c** icon appears in the Activity Bar.

### Setup

Click the **s2c** icon in the Activity Bar to open the panel, then enter your API key when prompted. The key is stored in VS Code's SecretStorage — it never touches `settings.json`.

You can also set keys via the command palette:
- `s2c: Set API Key` — Gemini
- `s2c: Set Groq API Key` — Groq

### Usage

1. Drag a `.png`, `.jpg`, `.jpeg`, or `.webp` screenshot onto the drop zone (or click to pick)
2. Configure options: animations, style, single-file mode, design system path, component name
3. Click **Generate Component**
4. Watch the per-pass progress — the component opens in your editor when done

### Workspace settings

```jsonc
// .vscode/settings.json
{
  "s2c.componentsDir": "src/components",   // component library path (auto-detected if empty)
  "s2c.outputDir": "",                      // output folder (empty = same folder as image)
  "s2c.defaultStyle": "tailwind",          // tailwind | css-modules | styled-components
  "s2c.defaultAnimate": false,
  "s2c.defaultSingleFile": false,
  "s2c.model": "gemini-2.5-flash"
}
```

## Development

```bash
# CLI
npm run dev      # watch mode — recompiles on save
npm run build    # one-shot build
npm test         # run tests

# Extension
cd extension
npm run build    # one-shot esbuild
npm run watch    # watch mode

# Extension — live dev (opens Extension Development Host)
# Open the extension/ folder in VS Code and press F5
```
