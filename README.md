# s2c — Screenshot to Code

A CLI tool that turns a UI screenshot into a clean, interactive React TypeScript component using a multi-pass AI pipeline.

```
❯ s2c ./screenshots/navbar.png

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated
  ✓ wrote Navbar.tsx
  ✓ opened in VS Code

❯ s2c ./screenshots/navbar.png --animate

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated
  ✓ animations added
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
  ✓ component generated
  ✓ wrote Closed.tsx
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
| `--name <Name>` | `-n` | Override the component name | Derived from filename |
| `--output <path>` | `-o` | Output file or directory | Current directory |
| `--model <id>` | `-m` | Use a different AI model | `gemini-2.5-flash` |
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
```

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

| Model | Notes |
|---|---|
| `gemini-2.5-flash` | Default. Fast and capable. |
| `gemini-2.5-pro` | Slower, higher quality. |
| `gemini-2.0-flash` | Previous generation flash. |

## Development

```bash
npm run dev      # watch mode — recompiles on save
npm run build    # one-shot build
npm test         # run tests
```
