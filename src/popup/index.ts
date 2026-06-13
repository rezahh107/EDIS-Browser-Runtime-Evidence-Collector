import type { CaptureJob, CaptureSession } from "../domain/model";
import { clearChildren, localizeDocument, request, requiredElement, setStatus } from "../shared/ui";

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
const permissionStatus = requiredElement<HTMLElement>("#permission-status");
const operationStatus = requiredElement<HTMLElement>("#operation-status");
const sessionSelect = requiredElement<HTMLSelectElement>("#session-select");
const captureButton = requiredElement<HTMLButtonElement>("#capture-button");
const openPanelButton = requiredElement<HTMLButtonElement>("#open-panel");
const viewportValue = requiredElement<HTMLElement>("#viewport-value");
const lastCapture = requiredElement<HTMLElement>("#last-capture");

localizeDocument();
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
        : (page.diagnostic?.message ?? chrome.i18n.getMessage("unsupported")),
      page.capturable ? "complete" : "error",
    );
    permissionStatus.textContent = page.capturable
      ? chrome.i18n.getMessage("statusReady")
      : chrome.i18n.getMessage("statusError");
    captureButton.disabled = !page.capturable;
    renderSessions(state);
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
    option.value = session.data.session_id;
    option.textContent = session.data.name;
    option.selected = session.data.session_id === state.currentSessionId;
    sessionSelect.append(option);
  }
  renderLastCapture(
    state.sessions.find((session) => session.data.session_id === sessionSelect.value),
  );
}

function renderLastCapture(session: CaptureSession | undefined): void {
  const capture = session?.data.captures.at(-1);
  viewportValue.textContent = capture ? `${capture.actual_width} × ${capture.actual_height}` : "—";
  lastCapture.textContent = capture ? new Date(capture.captured_at).toLocaleString() : "—";
}

sessionSelect.addEventListener("change", () => {
  if (sessionSelect.value) void request("SESSION_SELECT", { sessionId: sessionSelect.value });
  void request<State>("STATE_GET").then((state) =>
    renderLastCapture(
      state.sessions.find((session) => session.data.session_id === sessionSelect.value),
    ),
  );
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
      evidenceLabel: "SIMULATED_VIEWPORT",
      officialBreakpointId: null,
    });
    setStatus(operationStatus, `Capture started: ${job.status}`, "working");
  } catch (error: unknown) {
    setStatus(operationStatus, safeMessage(error), "error");
  } finally {
    captureButton.disabled = false;
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed safely.";
}
