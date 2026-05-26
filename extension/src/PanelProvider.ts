import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getApiKey, hasAnyApiKey, getSettings } from "./config";
import { run } from "./runner";

// Messages sent from the webview to the extension host
type WebviewMessage =
  | { type: "ready" }
  | { type: "generate"; imagePath: string; options: GenerateOptions }
  | { type: "pickFile"; purpose: "image" | "components" | "output" }
  | { type: "saveApiKey"; provider: "gemini" | "groq"; key: string }
  | { type: "saveSettings"; settings: Partial<ReturnType<typeof getSettings>> };

interface GenerateOptions {
  componentName?: string;
  model?: string;
  animate?: boolean;
  singleFile?: boolean;
  style?: "tailwind" | "css-modules" | "styled-components";
  noDesignSystem?: boolean;
  componentsDir?: string;
  outputDir?: string;
}

export class PanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "s2c.panel";

  private view?: vscode.WebviewView;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "webview"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  /** Called by extension.ts after an API key is saved via command palette */
  notifyApiKeySet(): void {
    this.sendConfig();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.sendConfig();
        break;

      case "generate":
        await this.handleGenerate(message.imagePath, message.options);
        break;

      case "pickFile":
        await this.handlePickFile(message.purpose);
        break;

      case "saveApiKey":
        await this.handleSaveApiKey(message.provider, message.key);
        break;

      case "saveSettings":
        // Persist settings changes from the panel to workspace config
        if (message.settings.componentsDir !== undefined) {
          await vscode.workspace
            .getConfiguration("s2c")
            .update("componentsDir", message.settings.componentsDir, vscode.ConfigurationTarget.Workspace);
        }
        if (message.settings.outputDir !== undefined) {
          await vscode.workspace
            .getConfiguration("s2c")
            .update("outputDir", message.settings.outputDir, vscode.ConfigurationTarget.Workspace);
        }
        break;
    }
  }

  private async handleGenerate(rawImagePath: string, options: GenerateOptions): Promise<void> {
    // Normalize path separators — drag events on Windows can produce mixed slashes
    const imagePath = path.normalize(rawImagePath);

    if (!fs.existsSync(imagePath)) {
      this.postError(`Image file not found: ${imagePath}`);
      return;
    }

    const model = options.model ?? getSettings().model;
    const apiKey = await getApiKey(this.context.secrets, model);

    if (!apiKey) {
      this.postError(
        "No API key found — enter your key in the panel or run \"s2c: Set API Key\" from the command palette."
      );
      return;
    }

    // Resolve API keys by provider
    const isGroq = ["llama", "mixtral", "gemma", "whisper", "deepseek", "qwen", "llava"].some(
      (p) => model.toLowerCase().startsWith(p)
    );

    try {
      const result = await run({
        imagePath,
        componentName: options.componentName,
        model,
        animate: options.animate,
        singleFile: options.singleFile,
        style: options.style,
        noDesignSystem: options.noDesignSystem,
        componentsDir: options.componentsDir,
        outputDir: options.outputDir,
        geminiApiKey: isGroq ? undefined : apiKey,
        groqApiKey: isGroq ? apiKey : undefined,
        onProgress: (pass, total, label) => {
          this.post({ type: "progress", pass, total, label });
        },
      });

      this.post({
        type: "done",
        outputPath: result.tsx,
        hook: result.hook,
        types: result.types,
        usedComponents: result.usedComponents,
      });

      // Open the main .tsx file in the editor
      const doc = await vscode.workspace.openTextDocument(result.tsx);
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postError(formatApiError(msg));
    }
  }

  private async handlePickFile(purpose: "image" | "components" | "output"): Promise<void> {
    if (purpose === "image") {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { Images: ["png", "jpg", "jpeg", "webp"] },
        title: "Select a screenshot",
      });
      if (uris?.[0]) {
        this.post({ type: "filePicked", purpose, path: uris[0].fsPath });
      }
    } else {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        title: purpose === "components" ? "Select component library folder" : "Select output folder",
      });
      if (uris?.[0]) {
        this.post({ type: "filePicked", purpose, path: uris[0].fsPath });
        // Persist the picked path to settings
        const key = purpose === "components" ? "componentsDir" : "outputDir";
        await vscode.workspace
          .getConfiguration("s2c")
          .update(key, uris[0].fsPath, vscode.ConfigurationTarget.Workspace);
      }
    }
  }

  private async handleSaveApiKey(provider: "gemini" | "groq", key: string): Promise<void> {
    const secretKey = provider === "gemini" ? "s2c.geminiApiKey" : "s2c.groqApiKey";
    await this.context.secrets.store(secretKey, key.trim());
    await this.sendConfig();
  }

  private async sendConfig(): Promise<void> {
    const settings = getSettings();
    const hasKey = await hasAnyApiKey(this.context.secrets);
    this.post({ type: "config", settings, hasApiKey: hasKey });
  }

  private post(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private postError(message: string): void {
    this.post({ type: "error", message });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "panel.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "webview", "styles.css")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>s2c</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function formatApiError(msg: string): string {
  if (msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("authentication")) {
    return "Authentication failed — check your API key. Run \"s2c: Set API Key\" to update it.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("rate limit")) {
    return "Rate limited — wait 60 seconds and try again, or switch to a different model in settings.";
  }
  return msg;
}
