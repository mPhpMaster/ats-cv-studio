import type { LinkedInImportResult } from './linkedin';

interface DesktopBridge {
  platform: string;
  saveFile(name: string, data: ArrayBuffer): Promise<boolean>;
  printToPdf(name: string): Promise<boolean>;
  /** Opens the profile in a LinkedIn window (reusing the browser login when possible) and returns its visible text. */
  linkedinImport?(url: string, options?: { useChrome?: boolean }): Promise<LinkedInImportResult>;
  /** Subscribe to LinkedIn import progress; returns an unsubscribe function. */
  onLinkedinProgress?(callback: (update: { stage: string; detail?: string }) => void): () => void;
  /** Current AI provider settings. The API key itself never crosses into the renderer — only `hasKey`. */
  aiSettingsGet?(): Promise<AiSettings>;
  aiSettingsSet?(patch: Partial<AiSettingsPatch>): Promise<AiSettings>;
  /** Sends the prompt to the configured provider from the main process and returns its raw reply. */
  aiComplete?(prompt: string): Promise<AiCompletion>;
}

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'custom';

export interface AiSettings {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  defaultModel: string;
  defaultBaseUrl: string;
}

export interface AiSettingsPatch {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  /** An empty string clears the stored key; omit the field to leave it untouched. */
  apiKey: string;
}

export type AiCompletion =
  | { ok: true; text: string }
  | { ok: false; error: string; message?: string };

declare global {
  interface Window {
    /** Exposed by the Electron preload script when running as the desktop app. */
    desktop?: DesktopBridge;
  }
}

export const isDesktop = () => typeof window !== 'undefined' && Boolean(window.desktop);

export async function downloadBlob(blob: Blob, fileName: string) {
  if (window.desktop) {
    await window.desktop.saveFile(fileName, await blob.arrayBuffer());
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save the printable CV as a text-based PDF (native save dialog on desktop, print dialog on the web). */
export async function savePdf(baseName: string) {
  if (window.desktop) {
    await window.desktop.printToPdf(`${baseName}.pdf`);
    return;
  }
  const prev = document.title;
  document.title = baseName;
  window.print();
  document.title = prev;
}
