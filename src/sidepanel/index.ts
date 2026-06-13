import type { CaptureJob, CaptureSession } from "../domain/model";
import { exportSession } from "../application/exportUseCase";
import {
  clearChildren,
  formatBytes,
  localizeDocument,
  request,
  requiredElement,
  setStatus,
} from "../shared/ui";

interface State {
  readonly currentSessionId: string | null;
  readonly sessions: readonly CaptureSession[];
  readonly storageUsage: number;
}
interface PageCheck {
  readonly capturable: boolean;
  readonly diagnostic?: { readonly message: string };
}

const pageStatus = requiredElement<HTMLElement>("#page-status");
const actualViewport = requiredElement<HTMLElement>("#actual-viewport");
const sessionSelect = requiredElement<HTMLSelectElement>("#session-select");
const sessionName = requiredElement<HTMLInputElement>("#session-name");
const createSessionButton = requiredElement<HTMLButtonElement>("#create-session");
const viewportLabel = requiredElement<HTMLInputElement>("#viewport-label");
const screenshotToggle = requiredElement<HTMLInputElement>("#screenshot-toggle");
const textToggle = requiredElement<HTMLInputElement>("#text-toggle");
const captureButton = requiredElement<HTMLButtonElement>("#capture-button");
const cancelButton = requiredElement<HTMLButtonElement>("#cancel-button");
const captureStatus = requiredElement<HTMLElement>("#capture-status");
const captureList = requiredElement<HTMLUListElement>("#capture-list");
const elementCount = requiredElement<HTMLElement>("#element-count");
const overflowCount = requiredElement<HTMLElement>("#overflow-count");
const diagnosticCount = requiredElement<HTMLElement>("#diagnostic-count");
const storageUsage = requiredElement<HTMLElement>("#storage-usage");
const privacySummary = requiredElement<HTMLElement>("#privacy-summary");
const exportButton = requiredElement<HTMLButtonElement>("#export-button");
const exportStatus = requiredElement<HTMLElement>("#export-status");
let activeJobId: string | null = null;

localizeDocument();
void initialize();

async function initialize(): Promise<void> {
  const [page, state] = await Promise.all([
    request<PageCheck>("PAGE_CHECK"),
    request<State>("STATE_GET"),
  ]);
  setStatus(
    pageStatus,
    page.capturable
      ? chrome.i18n.getMessage("supported")
      : (page.diagnostic?.message ?? chrome.i18n.getMessage("unsupported")),
    page.capturable ? "complete" : "error",
  );
  captureButton.disabled = !page.capturable;
  renderState(state);
}

function renderState(state: State): void {
  const selected = state.currentSessionId ?? sessionSelect.value;
  clearChildren(sessionSelect);
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Select a session";
  sessionSelect.append(empty);
  for (const session of state.sessions) {
    const option = document.createElement("option");
    option.value = session.data.session_id;
    option.textContent = session.data.name;
    option.selected = session.data.session_id === selected;
    sessionSelect.append(option);
  }
  storageUsage.textContent = formatBytes(state.storageUsage);
  renderSession(state.sessions.find((session) => session.data.session_id === sessionSelect.value));
}

function renderSession(session: CaptureSession | undefined): void {
  clearChildren(captureList);
  const captures = session?.data.captures ?? [];
  if (captures.length === 0) {
    const item = document.createElement("li");
    item.textContent = chrome.i18n.getMessage("noCaptures");
    captureList.append(item);
  } else {
    for (const capture of captures) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = `${capture.label}: ${capture.actual_width} × ${capture.actual_height}`;
      const details = document.createElement("p");
      details.className = "muted";
      details.textContent = `${capture.element_count} elements · ${capture.overflow_count} overflow facts · ${capture.diagnostic_count} diagnostics${capture.screenshot_available ? " · screenshot" : ""}`;
      item.append(title, details);
      captureList.append(item);
    }
  }
  const latest = captures.at(-1);
  actualViewport.textContent = latest
    ? `${latest.actual_width} × ${latest.actual_height}`
    : "Not captured";
  elementCount.textContent = String(latest?.element_count ?? 0);
  overflowCount.textContent = String(latest?.overflow_count ?? 0);
  diagnosticCount.textContent = String(latest?.diagnostic_count ?? 0);
  exportButton.disabled = !session || captures.length === 0;
  updatePrivacySummary();
}

function updatePrivacySummary(): void {
  privacySummary.textContent = [
    "Local-only JSON evidence",
    screenshotToggle.checked ? "visible screenshot enabled" : "screenshot disabled",
    textToggle.checked ? "limited text preview enabled" : "full text excluded",
    "form values, cookies, history, URL query, and URL fragment excluded",
  ].join("; ");
}

sessionSelect.addEventListener("change", () => {
  if (!sessionSelect.value) return;
  void request("SESSION_SELECT", { sessionId: sessionSelect.value }).then(refreshState);
});

createSessionButton.addEventListener("click", () => {
  void createSession();
});

screenshotToggle.addEventListener("change", () => {
  if (screenshotToggle.checked && !window.confirm(chrome.i18n.getMessage("privacyWarning")))
    screenshotToggle.checked = false;
  updatePrivacySummary();
});

textToggle.addEventListener("change", () => {
  if (textToggle.checked && !window.confirm(chrome.i18n.getMessage("privacyWarning")))
    textToggle.checked = false;
  updatePrivacySummary();
});

captureButton.addEventListener("click", () => {
  void startCapture();
});

cancelButton.addEventListener("click", () => {
  if (!activeJobId) return;
  void request("CAPTURE_CANCEL", { jobId: activeJobId }).then(() => {
    activeJobId = null;
    cancelButton.disabled = true;
    setStatus(captureStatus, "Capture cancelled.", "ready");
  });
});

exportButton.addEventListener("click", () => {
  void exportCurrentSession();
});

async function createSession(): Promise<void> {
  const name = sessionName.value.trim();
  if (!name) return;
  await request("SESSION_CREATE", { name });
  await refreshState();
  sessionSelect.focus();
}

async function startCapture(): Promise<void> {
  if (!sessionSelect.value) {
    setStatus(captureStatus, "Create or select a session first.", "error");
    return;
  }
  captureButton.disabled = true;
  cancelButton.disabled = false;
  setStatus(captureStatus, chrome.i18n.getMessage("statusWorking"), "working");
  try {
    const job = await request<CaptureJob>("CAPTURE_START", {
      sessionId: sessionSelect.value,
      userLabel: viewportLabel.value.trim() || "Current viewport",
      evidenceLabel: "USER_LABELED_VIEWPORT",
      officialBreakpointId: null,
      overrides: {
        includeScreenshot: screenshotToggle.checked,
        includeTextPreview: textToggle.checked,
      },
    });
    activeJobId = job.id;
    await waitForCompletion(job.id);
  } catch (error: unknown) {
    setStatus(captureStatus, safeMessage(error), "error");
  } finally {
    activeJobId = null;
    captureButton.disabled = false;
    cancelButton.disabled = true;
  }
}

async function waitForCompletion(jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(500);
    const job = await request<CaptureJob | undefined>("CAPTURE_STATUS", { jobId });
    if (!job) throw new Error("Capture job was not found.");
    setStatus(
      captureStatus,
      `Capture status: ${job.status}`,
      job.status === "COMPLETE"
        ? "complete"
        : job.status === "FAILED" || job.status === "NAVIGATED" || job.status === "INTERRUPTED"
          ? "error"
          : "working",
    );
    if (job.status === "COMPLETE") {
      await refreshState();
      return;
    }
    if (["FAILED", "CANCELLED", "NAVIGATED", "INTERRUPTED"].includes(job.status))
      throw new Error(job.diagnostics.at(-1)?.message ?? `Capture ended with ${job.status}.`);
  }
  throw new Error("Capture status timed out. Reopen the panel to inspect the persisted job.");
}

async function exportCurrentSession(): Promise<void> {
  const sessionId = sessionSelect.value;
  if (!sessionId) return;
  exportButton.disabled = true;
  setStatus(exportStatus, chrome.i18n.getMessage("statusWorking"), "working");
  try {
    const result = await exportSession(sessionId);
    setStatus(exportStatus, `${result.filename} (${result.entryCount} entries)`, "complete");
    await request("EXPORT_COMPLETE", { sessionId });
    await refreshState();
  } catch (error: unknown) {
    setStatus(exportStatus, safeMessage(error), "error");
  } finally {
    exportButton.disabled = false;
  }
}

async function refreshState(): Promise<void> {
  renderState(await request<State>("STATE_GET"));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed safely.";
}
