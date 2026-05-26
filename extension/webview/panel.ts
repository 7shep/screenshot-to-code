// Webview script — runs inside VS Code's sandboxed webview iframe.
// No Node APIs available. Communicates with the extension host via acquireVsCodeApi().

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface S2CConfig {
  componentsDir: string;
  outputDir: string;
  defaultStyle: "tailwind" | "css-modules" | "styled-components";
  defaultAnimate: boolean;
  defaultSingleFile: boolean;
  model: string;
}

type HostMessage =
  | { type: "config"; settings: S2CConfig; hasApiKey: boolean; hasGeminiKey: boolean; hasGroqKey: boolean }
  | { type: "progress"; pass: number; total: number; label: string }
  | { type: "done"; outputPath: string; hook?: string; types?: string; usedComponents: string[] }
  | { type: "error"; message: string }
  | { type: "filePicked"; purpose: "image" | "components" | "output"; path: string };

const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────

let selectedImagePath = "";
let isGenerating = false;
let config: S2CConfig = {
  componentsDir: "",
  outputDir: "",
  defaultStyle: "tailwind",
  defaultAnimate: false,
  defaultSingleFile: false,
  model: "gemini-2.5-flash",
};
let hasApiKey = false;
let hasGeminiKey = false;
let hasGroqKey = false;

// User's current option selections — survive re-renders
let optAnimate = false;
let optSingleFile = false;
let optNoDesignSystem = false;
let optStyle: "tailwind" | "css-modules" | "styled-components" = "tailwind";
let optModel = "gemini-2.5-flash";
let optComponentName = "";

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById("app")!;

  if (!hasApiKey) {
    app.innerHTML = renderSetupScreen();
    bindSetupScreen();
    return;
  }

  app.innerHTML = renderPanel();
  bindPanel();
}

function renderSetupScreen(): string {
  return `
    <div class="setup-screen">
      <h2>Welcome to s2c</h2>
      <p>Drag a screenshot onto the panel and get a React component back in seconds.</p>
      <p>First, enter your <a href="https://aistudio.google.com/apikey">Gemini API key</a>
         (stored securely — never in settings.json):</p>
      <div class="apikey-row">
        <input id="apikey-input" type="password" placeholder="AIza..." autocomplete="off"/>
        <button class="btn-pick" id="apikey-save-btn">Save</button>
      </div>
      <p style="margin-top:4px">Using Groq instead? Run <strong>s2c: Set Groq API Key</strong> from the command palette.</p>
    </div>`;
}

function renderPanel(): string {
  const fileName = selectedImagePath
    ? selectedImagePath.split(/[\\/]/).pop() ?? selectedImagePath
    : "";

  return `
    <div class="panel">

      <!-- Drop zone -->
      <div class="drop-zone" id="drop-zone">
        ${
          fileName
            ? `<span class="file-name">📄 ${escHtml(fileName)}</span>
               <span class="drop-label">drop another to replace</span>`
            : `<span class="drop-icon">📷</span>
               <span class="drop-label"><strong>Drop image here</strong><br>or click to pick</span>`
        }
      </div>

      <hr/>

      <!-- Options -->
      <div class="section-label">Options</div>

      <div class="option-row">
        <input type="checkbox" id="opt-animate" ${optAnimate ? "checked" : ""}/>
        <label for="opt-animate">Add animations (Framer Motion)</label>
      </div>

      <div class="option-row">
        <input type="checkbox" id="opt-single" ${optSingleFile ? "checked" : ""}/>
        <label for="opt-single">Single-file mode <span style="opacity:0.6;font-size:10px">(default: 3 files)</span></label>
      </div>

      <div class="option-row">
        <input type="checkbox" id="opt-no-ds" ${optNoDesignSystem ? "checked" : ""}/>
        <label for="opt-no-ds">Skip design system</label>
      </div>

      <div class="style-row">
        <label for="opt-style">Style:</label>
        <select id="opt-style">
          <option value="tailwind" ${optStyle === "tailwind" ? "selected" : ""}>Tailwind</option>
          <option value="css-modules" ${optStyle === "css-modules" ? "selected" : ""}>CSS Modules</option>
          <option value="styled-components" ${optStyle === "styled-components" ? "selected" : ""}>Styled Components</option>
        </select>
      </div>

      <hr/>

      <!-- Model -->
      <div class="section-label">Model</div>
      <select id="opt-model" class="model-select">
        <optgroup label="Google Gemini">
          <option value="gemini-2.5-flash" ${optModel === "gemini-2.5-flash" ? "selected" : ""}>gemini-2.5-flash — fast (default)</option>
          <option value="gemini-2.5-pro" ${optModel === "gemini-2.5-pro" ? "selected" : ""}>gemini-2.5-pro — higher quality</option>
          <option value="gemini-2.0-flash" ${optModel === "gemini-2.0-flash" ? "selected" : ""}>gemini-2.0-flash — previous gen</option>
        </optgroup>
        <optgroup label="Groq (Llama 4)">
          <option value="meta-llama/llama-4-scout-17b-16e-instruct" ${optModel === "meta-llama/llama-4-scout-17b-16e-instruct" ? "selected" : ""}>llama-4-scout — fast</option>
          <option value="meta-llama/llama-4-maverick-17b-128e-instruct" ${optModel === "meta-llama/llama-4-maverick-17b-128e-instruct" ? "selected" : ""}>llama-4-maverick — higher quality</option>
        </optgroup>
      </select>

      <hr/>

      <!-- Design system -->
      <div class="section-label">Design System</div>
      <div class="path-row">
        <input type="text" id="components-dir" placeholder="auto-detect" value="${escHtml(config.componentsDir)}"/>
        <button class="btn-pick" id="pick-components-btn">Pick</button>
      </div>

      <!-- Output -->
      <div class="section-label" style="margin-top:6px">Output</div>
      <div class="path-row">
        <input type="text" id="output-name" placeholder="Derived from filename" value="${escHtml(optComponentName)}" style="flex:1"/>
        <span class="path-label">Name</span>
      </div>
      <div class="path-row" style="margin-top:4px">
        <input type="text" id="output-dir" placeholder="Same as image" value="${escHtml(config.outputDir)}"/>
        <button class="btn-pick" id="pick-output-btn">Pick</button>
      </div>

      <hr/>

      <!-- API Keys -->
      <div class="section-label">API Keys</div>
      <div class="apikey-section">
        <div class="apikey-provider-row">
          <span class="provider-label">Gemini</span>
          <span class="key-status ${hasGeminiKey ? "key-set" : "key-unset"}">${hasGeminiKey ? "●" : "○"}</span>
          <input type="password" id="gemini-key-input" placeholder="${hasGeminiKey ? "update key…" : "AIza…"}" autocomplete="off"/>
          <button class="btn-pick" id="gemini-key-save">Save</button>
        </div>
        <div class="apikey-provider-row">
          <span class="provider-label">Groq</span>
          <span class="key-status ${hasGroqKey ? "key-set" : "key-unset"}">${hasGroqKey ? "●" : "○"}</span>
          <input type="password" id="groq-key-input" placeholder="${hasGroqKey ? "update key…" : "gsk_…"}" autocomplete="off"/>
          <button class="btn-pick" id="groq-key-save">Save</button>
        </div>
      </div>

      <hr/>

      <!-- Generate button -->
      <button class="btn-generate" id="generate-btn" ${!selectedImagePath || isGenerating ? "disabled" : ""}>
        ${isGenerating ? "Generating…" : "Generate Component"}
      </button>

      <!-- Log / status area -->
      <div id="log-area"></div>

    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindSetupScreen(): void {
  const input = document.getElementById("apikey-input") as HTMLInputElement;
  const btn = document.getElementById("apikey-save-btn") as HTMLButtonElement;

  btn.addEventListener("click", () => saveApiKey("gemini", input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveApiKey("gemini", input.value);
  });
}

function bindPanel(): void {
  // Drop zone
  const dropZone = document.getElementById("drop-zone")!;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelected((file as File & { path?: string }).path ?? file.name);
  });
  // Click uses VS Code's native file picker so we always get a full filesystem path
  dropZone.addEventListener("click", () => {
    vscode.postMessage({ type: "pickFile", purpose: "image" });
  });

  // Pick buttons
  document.getElementById("pick-components-btn")?.addEventListener("click", () =>
    vscode.postMessage({ type: "pickFile", purpose: "components" })
  );
  document.getElementById("pick-output-btn")?.addEventListener("click", () =>
    vscode.postMessage({ type: "pickFile", purpose: "output" })
  );

  // Generate
  document.getElementById("generate-btn")?.addEventListener("click", generate);

  // Track option state so it survives re-renders
  document.getElementById("opt-animate")?.addEventListener("change", (e) => {
    optAnimate = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("opt-single")?.addEventListener("change", (e) => {
    optSingleFile = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("opt-no-ds")?.addEventListener("change", (e) => {
    optNoDesignSystem = (e.target as HTMLInputElement).checked;
  });
  document.getElementById("opt-style")?.addEventListener("change", (e) => {
    optStyle = (e.target as HTMLSelectElement).value as typeof optStyle;
  });
  document.getElementById("opt-model")?.addEventListener("change", (e) => {
    optModel = (e.target as HTMLSelectElement).value;
    vscode.postMessage({ type: "saveSettings", settings: { model: optModel } });
  });

  // API key saves from main panel
  document.getElementById("gemini-key-save")?.addEventListener("click", () => {
    const input = document.getElementById("gemini-key-input") as HTMLInputElement;
    if (input.value.trim()) saveApiKey("gemini", input.value);
  });
  document.getElementById("groq-key-save")?.addEventListener("click", () => {
    const input = document.getElementById("groq-key-input") as HTMLInputElement;
    if (input.value.trim()) saveApiKey("groq", input.value);
  });

  document.getElementById("output-name")?.addEventListener("input", (e) => {
    optComponentName = (e.target as HTMLInputElement).value.trim();
  });

  // Settings persistence on change
  document.getElementById("components-dir")?.addEventListener("change", (e) => {
    config.componentsDir = (e.target as HTMLInputElement).value;
    vscode.postMessage({ type: "saveSettings", settings: { componentsDir: config.componentsDir } });
  });
  document.getElementById("output-dir")?.addEventListener("change", (e) => {
    config.outputDir = (e.target as HTMLInputElement).value;
    vscode.postMessage({ type: "saveSettings", settings: { outputDir: config.outputDir } });
  });
}

function handleFileSelected(filePath: string): void {
  selectedImagePath = filePath;
  isGenerating = false;
  render();
}

function saveApiKey(provider: "gemini" | "groq", key: string): void {
  if (!key.trim()) return;
  vscode.postMessage({ type: "saveApiKey", provider, key: key.trim() });
}

function generate(): void {
  if (!selectedImagePath || isGenerating) return;

  const componentsDir = (document.getElementById("components-dir") as HTMLInputElement)?.value || undefined;
  const outputDir = (document.getElementById("output-dir") as HTMLInputElement)?.value || undefined;

  isGenerating = true;
  render();

  const logArea = document.getElementById("log-area");
  if (logArea) {
    logArea.innerHTML = `<div class="progress-log">${buildProgressLines(0, optAnimate ? 5 : 4, "loading design system...")}</div>`;
  }

  vscode.postMessage({
    type: "generate",
    imagePath: selectedImagePath,
    options: {
      model: optModel,
      componentName: optComponentName || undefined,
      animate: optAnimate,
      singleFile: optSingleFile,
      style: optStyle,
      noDesignSystem: optNoDesignSystem,
      componentsDir,
      outputDir,
    },
  });
}

// ── Message handling ──────────────────────────────────────────────────────────

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "config":
      config = msg.settings;
      hasApiKey = msg.hasApiKey;
      hasGeminiKey = msg.hasGeminiKey;
      hasGroqKey = msg.hasGroqKey;
      // Only apply workspace defaults on first load (before user has touched anything)
      if (!selectedImagePath && !isGenerating) {
        optAnimate = config.defaultAnimate;
        optSingleFile = config.defaultSingleFile;
        optStyle = config.defaultStyle;
        optModel = config.model;
      }
      render();
      break;

    case "progress": {
      const area = document.getElementById("log-area");
      if (area) {
        area.innerHTML = `<div class="progress-log">${buildProgressLines(msg.pass, msg.total, msg.label)}</div>`;
      }
      break;
    }

    case "done": {
      isGenerating = false;
      const fileName = msg.outputPath.split(/[\\/]/).pop() ?? msg.outputPath;
      const area = document.getElementById("log-area");
      if (area) {
        let detail = `<span class="done-detail">✓ wrote ${escHtml(fileName)}</span>`;
        if (msg.hook) {
          const h = msg.hook.split(/[\\/]/).pop() ?? msg.hook;
          detail += `<span class="done-detail">✓ wrote ${escHtml(h)}</span>`;
        }
        if (msg.types) {
          const t = msg.types.split(/[\\/]/).pop() ?? msg.types;
          detail += `<span class="done-detail">✓ wrote ${escHtml(t)}</span>`;
        }
        if (msg.usedComponents.length > 0) {
          detail += `<span class="done-detail" style="color:var(--vscode-foreground)">used: ${escHtml(msg.usedComponents.join(", "))}</span>`;
        }
        area.innerHTML = `<div class="done-banner"><span class="done-title">Component ready</span>${detail}</div>`;
      }
      // Re-enable the generate button
      const btn = document.getElementById("generate-btn") as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Generate Component";
      }
      break;
    }

    case "error": {
      isGenerating = false;
      const area = document.getElementById("log-area");
      if (area) {
        area.innerHTML = `<div class="error-banner">${escHtml(msg.message)}</div>`;
      }
      const btn = document.getElementById("generate-btn") as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Generate Component";
      }
      break;
    }

    case "filePicked":
      if (msg.purpose === "image") {
        handleFileSelected(msg.path);
      } else if (msg.purpose === "components") {
        config.componentsDir = msg.path;
        const input = document.getElementById("components-dir") as HTMLInputElement | null;
        if (input) input.value = msg.path;
      } else if (msg.purpose === "output") {
        config.outputDir = msg.path;
        const input = document.getElementById("output-dir") as HTMLInputElement | null;
        if (input) input.value = msg.path;
      }
      break;
  }
});

// Build progress lines with pass labels
const PASS_LABELS: Record<number, string> = {
  0: "loading design system",
  1: "analysing screenshot",
  2: "analysing interactions",
  3: "generating component",
  4: "adding animations",
};

function getDoneLabel(pass: number): string {
  return PASS_LABELS[pass] ?? `pass ${pass}`;
}

function buildProgressLines(currentPass: number, total: number, currentLabel: string): string {
  let html = "";
  for (let i = 0; i <= total; i++) {
    if (i < currentPass) {
      html += `<div class="log-entry done"><span class="icon">✓</span><span class="text">${escHtml(getDoneLabel(i))}</span></div>`;
    } else if (i === currentPass) {
      html += `<div class="log-entry running"><span class="icon"><span class="spinner">◌</span></span><span class="text">${escHtml(currentLabel)}</span></div>`;
    }
  }
  return html;
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Boot ──────────────────────────────────────────────────────────────────────

// Tell the extension host we're ready — it will reply with the current config
vscode.postMessage({ type: "ready" });
