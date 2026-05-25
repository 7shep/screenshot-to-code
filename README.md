# s2c — Screenshot to Code

A CLI tool that turns a UI screenshot into a clean React TypeScript component using an AI vision model.

```
❯ s2c ./screenshots/navbar.png

  ✓ image loaded
  ✓ component generated
  ✓ wrote /screenshots/Navbar.tsx
  ✓ opened in VS Code
```

## Requirements

- Node.js ≥ 18
- An API key for your chosen model provider (see [Models](#models))

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

## Usage

```bash
s2c <image> [options]
```

### Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--name <Name>` | `-n` | Override the component name | Derived from filename |
| `--output <path>` | `-o` | Output file or directory | Next to the image |
| `--model <id>` | `-m` | Use a different AI model | `gemini-2.5-flash` |
| `--no-open` | | Skip opening VS Code | — |
| `--help` | `-h` | Show help | — |

### Supported image formats

`.png`, `.jpg`, `.jpeg`, `.webp`

## Models

The default model is `gemini-2.5-flash`. You can swap to any model that supports vision using `--model`.

### Google Gemini

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`.

| Model | Notes |
|---|---|
| `gemini-2.5-flash` | Default. Fast and capable. |
| `gemini-2.5-pro` | Slower, higher quality. |
| `gemini-2.0-flash` | Previous generation flash. |

### Anthropic Claude

Get a key at [console.anthropic.com](https://console.anthropic.com/settings/api-keys) and set `ANTHROPIC_API_KEY` in your `.env`.

> **Note:** Using Claude requires changing the client in `src/generate.ts` back to `@anthropic-ai/sdk`. The `--model` flag passes the model ID straight through to whichever client is compiled in.

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

## Development

```bash
npm run dev    # watch mode — recompiles on save
npm run build  # one-shot build
```
