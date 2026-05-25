# s2c — Screenshot to Code

A CLI tool that turns a UI screenshot into a clean, interactive React TypeScript component using a 3-pass AI pipeline.

```
❯ s2c ./screenshots/navbar.png

  ✓ image loaded
  ✓ screenshot analysed
  ✓ interactions analysed
  ✓ component generated
  ✓ wrote Navbar.tsx
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

# Watch a directory for new screenshots
s2c --watch <dir> [options]
```

### Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--watch <dir>` | `-w` | Watch a directory and convert new images automatically | — |
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
```

## Watch Mode

Watch mode monitors a directory and automatically converts any new image dropped into it.

```bash
s2c --watch ./screenshots --output ./src/components
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

s2c runs three AI passes on every screenshot before writing a single line of code:

1. **Visual analysis** — the model inspects the screenshot and produces a structured description of the layout, colour palette, typography, spacing, and every UI component visible.
2. **Interaction analysis** — a second pass identifies every interactive element (buttons, inputs, tabs, toggles, forms) and describes exactly what each one should do: what state it needs, what triggers it, and what behaviour to implement.
3. **Component generation** — the model receives the image alongside both analyses and generates a fully typed `.tsx` file with real `useState` hooks and handlers wired up, Tailwind classes, and `lucide-react` icons.

This pipeline is what separates s2c from pasting a screenshot into a chat window — you get a component that actually works, not just one that looks right.

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
