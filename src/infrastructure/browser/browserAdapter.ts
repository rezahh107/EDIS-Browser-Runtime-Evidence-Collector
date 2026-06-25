import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { err, ok, type Result } from "../../domain/result";

export interface RawPageProbe {
  readonly url: string;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly pageMarkerPresent: boolean;
  readonly rawDataElementorIds: readonly string[];
  readonly scrollX: number;
  readonly scrollY: number;
  readonly documentVisibilityState: DocumentVisibilityState;
  readonly documentPrerendering: boolean;
  readonly adminBar: Readonly<{
    bodyAdminBarClass: boolean;
    wpadminbarElementPresent: boolean;
    wpadminbarComputedDisplay: string | null;
    wpadminbarComputedVisibility: string | null;
    wpadminbarRectHeight: number | null;
    htmlComputedMarginTop: string;
    bodyComputedMarginTop: string | null;
    detectionState: "ABSENT" | "PRESENT" | "AMBIGUOUS";
  }>;
  readonly elementorEditorPreviewPresent: boolean;
  readonly iframeCapture: boolean;
  readonly viewportImageReadiness: Readonly<{
    candidateCount: number;
    loadedCount: number;
    brokenCount: number;
    pendingCount: number;
    decodeFailedCount: number;
    timedOutCount: number;
    waitTimeMs: number;
    timeoutMs: number;
    timeoutPolicyId: string;
    timeoutPolicyVersion: number;
  }>;
}

export interface ActiveTab {
  readonly id: number;
  readonly windowId: number;
  readonly url: string;
}

export interface BrowserAdapter {
  getActiveTab(): Promise<Result<ActiveTab, Diagnostic>>;
  injectCollector(tabId: number): Promise<Result<void, Diagnostic>>;
  probePage(tabId: number): Promise<Result<RawPageProbe, Diagnostic>>;
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
  return diagnostic(
    "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    "ERROR",
    message,
    false,
    {},
    "OPERATIONAL",
    "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
  );
}
