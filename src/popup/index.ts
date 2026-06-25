import type { Diagnostic } from "../domain/diagnostics";
import {
  isRequestedViewportProfile,
  type CaptureJob,
  type CaptureSession,
  type CaptureSessionSummary,
  type PageProbeEvidence,
  type RequestedViewportProfile,
} from "../domain/model";
import {
  clearChildren,
  diagnosticUiMessage,
  localizeDocument,
  request,
  requiredElement,
  setStatus,
} from "../shared/ui";

interface State {
  readonly currentSessionId: string | null;
  readonly currentSession: CaptureSession | null;
  readonly sessions: readonly CaptureSessionSummary[];
  readonly storageUsage: number;
}
interface PageCheck {
  readonly capturable: boolean;
  readonly diagnostic?: Diagnostic;
}

const pageStatus = requiredElement<HTMLElement>("#page-status");
const permissionStatus = requiredElement<HTMLElement>("#permission-status");
const operationStatus = requiredElement<HTMLElement>("#operation-status");
const sessionSelect = requiredElement<HTMLSelectElement>("#session-select");
const viewportProfile = requiredElement<HTMLSelectElement>("#viewport-profile");
const captureButton = requiredElement<HTMLButtonElement>("#capture-button");
const openPanelButton = requiredElement<HTMLButtonElement>("#open-panel");
const viewportValue = requiredElement<HTMLElement>("#viewport-value");
const lastCapture = requiredElement<HTMLElement>("#last-capture");
const extensionVersion = requiredElement<HTMLElement>("#extension-version");

localizeDocument();
extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
void initialize();

async function initialize(): Promise<void> {
  try {
    const [page, state] = await Promise.all([
      request<PageCheck>("PAGE_CHECK"),
      request<State>("STATE_GET"),
    ]);
    setStatus(
      pageStatus,
      page.capturable
        ? chrome.i18n.getMessage("supported")
        : page.diagnostic
          ? diagnosticUiMessage(page.diagnostic)
          : chrome.i18n.getMessage("unsupported"),
      page.capturable ? "complete" : "error",
    );
    permissionStatus.textContent = page.capturable
      ? chrome.i18n.getMessage("statusReady")
      : chrome.i18n.getMessage("statusError");
    captureButton.disabled = !page.capturable;
    renderSessions(state);
    if (page.capturable) await refreshMeasuredViewport();
  } catch (error: unknown) {
    setStatus(pageStatus, safeMessage(error), "error");
    captureButton.disabled = true;
  }
}

function renderSessions(state: State): void {
  clearChildren(sessionSelect);
  if (state.sessions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "New default session";
    sessionSelect.append(option);
    viewportValue.textContent = "—";
    lastCapture.textContent = "—";
    return;
  }
  for (const session of state.sessions) {
    const option = document.createElement("option");
    option.value = session.session_id;
    option.textContent = session.name;
    option.selected = session.session_id === state.currentSessionId;
    sessionSelect.append(option);
  }
  renderLastCapture(state.currentSession ?? undefined);
}

function renderLastCapture(session: CaptureSession | undefined): void {
  const capture = session?.data.captures.at(-1);
  viewportValue.textContent = capture ? `${capture.actual_width} × ${capture.actual_height}` : "—";
  lastCapture.textContent = capture ? new Date(capture.captured_at).toLocaleString() : "—";
}

sessionSelect.addEventListener("change", () => {
  if (!sessionSelect.value) return;
  void request("SESSION_SELECT", { sessionId: sessionSelect.value })
    .then(() => request<State>("STATE_GET"))
    .then((state) => renderLastCapture(state.currentSession ?? undefined));
});

captureButton.addEventListener("click", () => {
  void captureCurrent();
});

openPanelButton.addEventListener("click", () => {
  void request("OPEN_SIDE_PANEL").catch((error: unknown) =>
    setStatus(operationStatus, safeMessage(error), "error"),
  );
});

async function captureCurrent(): Promise<void> {
  captureButton.disabled = true;
  setStatus(operationStatus, chrome.i18n.getMessage("statusWorking"), "working");
  try {
    let sessionId = sessionSelect.value;
    if (!sessionId) {
      const session = await request<CaptureSession>("SESSION_CREATE", { name: "Browser capture" });
      sessionId = session.data.session_id;
    }
    const job = await request<CaptureJob>("CAPTURE_START", {
      sessionId,
      userLabel: "Current viewport",
      evidenceLabel: "USER_LABELED_VIEWPORT",
      requestedProfileId: selectedViewportProfile(),
      workflowMode: "RUNTIME_EVIDENCE",
    });
    setStatus(operationStatus, `Capture status: ${job.status}`, "working");
    await waitForCompletion(job.id);
  } catch (error: unknown) {
    setStatus(operationStatus, safeMessage(error), "error");
  } finally {
    captureButton.disabled = false;
  }
}

async function waitForCompletion(jobId: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let pollDelayMs = 250;
  while (Date.now() < deadline) {
    await delay(pollDelayMs);
    const job = await request<CaptureJob | undefined>("CAPTURE_STATUS", { jobId });
    if (!job) throw new Error("Capture job was not found.");
    if (job.status === "COMPLETE") {
      const state = await request<State>("STATE_GET");
      renderSessions(state);
      setStatus(operationStatus, "Capture complete.", "complete");
      return;
    }
    if (["FAILED", "CANCELLED", "NAVIGATED", "INTERRUPTED"].includes(job.status))
      throw new Error(lastDiagnosticMessage(job) ?? `Capture ended with ${job.status}.`);
    setStatus(operationStatus, `Capture status: ${job.status}`, "working");
    pollDelayMs = Math.min(Math.ceil(pollDelayMs * 1.5), 2_000);
  }
  throw new Error("Capture status timed out. Open the side panel to inspect the persisted job.");
}

async function refreshMeasuredViewport(): Promise<void> {
  const probe = await request<PageProbeEvidence>("PAGE_PROBE");
  viewportValue.textContent = `${probe.inner_width} × ${probe.inner_height}`;
}

function selectedViewportProfile(): RequestedViewportProfile {
  if (!isRequestedViewportProfile(viewportProfile.value))
    throw new Error("The selected viewport profile is invalid.");
  return viewportProfile.value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed safely.";
}

function lastDiagnosticMessage(job: CaptureJob): string | null {
  const item = job.diagnostics.at(-1);
  return item ? diagnosticUiMessage(item) : null;
}
