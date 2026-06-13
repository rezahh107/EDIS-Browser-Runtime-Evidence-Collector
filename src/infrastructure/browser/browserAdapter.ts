import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { err, ok, type Result } from "../../domain/result";

export interface ActiveTab {
  readonly id: number;
  readonly windowId: number;
  readonly url: string;
}

export interface BrowserAdapter {
  getActiveTab(): Promise<Result<ActiveTab, Diagnostic>>;
  injectCollector(tabId: number): Promise<Result<void, Diagnostic>>;
  captureVisibleViewport(windowId: number): Promise<Result<string, Diagnostic>>;
  openWorkflow(tabId: number): Promise<Result<void, Diagnostic>>;
  getVersion(): string;
}

export function isCapturableUrl(raw: string): Result<URL, Diagnostic> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return err(unsupported("The current page URL is invalid."));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return err(unsupported("Only normal HTTP and HTTPS pages can be captured."));
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "chrome.google.com" ||
    host === "chromewebstore.google.com" ||
    host === "microsoftedge.microsoft.com" ||
    host.endsWith(".addons.mozilla.org")
  ) {
    return err(unsupported("Browser extension store pages cannot be captured."));
  }
  return ok(url);
}

function unsupported(message: string): Diagnostic {
  return diagnostic("EDIS_RUNTIME_UNSUPPORTED_PAGE", "ERROR", message, false);
}
