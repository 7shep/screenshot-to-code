# Changelog

All notable changes to s2c are documented here.

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
