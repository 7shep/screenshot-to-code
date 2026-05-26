import * as vscode from "vscode";
import { PanelProvider } from "./PanelProvider";

export const outputChannel = vscode.window.createOutputChannel("s2c");

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(outputChannel);
  const provider = new PanelProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PanelProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("s2c.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "s2c: Set Gemini API Key",
        prompt: "Paste your Gemini API key — stored securely, never in settings.json",
        password: true,
        placeHolder: "AIza...",
        ignoreFocusOut: true,
      });
      if (key?.trim()) {
        await context.secrets.store("s2c.geminiApiKey", key.trim());
        vscode.window.showInformationMessage("s2c: Gemini API key saved.");
        provider.notifyApiKeySet();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("s2c.setGroqApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "s2c: Set Groq API Key",
        prompt: "Paste your Groq API key — stored securely, never in settings.json",
        password: true,
        placeHolder: "gsk_...",
        ignoreFocusOut: true,
      });
      if (key?.trim()) {
        await context.secrets.store("s2c.groqApiKey", key.trim());
        vscode.window.showInformationMessage("s2c: Groq API key saved.");
        provider.notifyApiKeySet();
      }
    })
  );
}

export function deactivate(): void {}
