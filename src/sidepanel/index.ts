import type { Diagnostic } from "../domain/diagnostics";
import {
  isRequestedViewportProfile,
  type CaptureJob,
  type CaptureSession,
  type CaptureSessionSummary,
  type CaptureWorkflowMode,
  type PageProbeEvidence,
  type PythonFeedCaptureGuard,
  type RequestedViewportProfile,
} from "../domain/model";
import {
  exportSession,
  getExportPreflight,
  type ExportPreflightReport,
} from "../application/exportUseCase";
import type { ExportPurpose } from "../domain/pythonFeed";
import { makeExportPreflightViewState } from "./exportPreflightView";
import {
  clearChildren,
  diagnosticUiMessage,
  formatBytes,
  localizeDocument,
  request,
  requiredElement,
  setStatus,
} from "../shared/ui";
import { effectiveSessionWorkflowMode } from "../domain/capturePolicy";

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
interface SourceContextState {
  readonly imported: boolean;
  readonly selectedDocumentId?: string | null;
  readonly documents?: readonly {
    documentId: string;
    documentType: string;
    elementCount: number;
  }[];
}

const extensionVersion = requiredElement<HTMLElement>("#extension-version");
const pageStatus = requiredElement<HTMLElement>("#page-status");
const actualViewport = requiredElement<HTMLElement>("#actual-viewport");
const sourceContextState = requiredElement<HTMLElement>("#source-context-state");
const pageBindingState = requiredElement<HTMLElement>("#page-binding-state");
const sourceDocument = requiredElement<HTMLElement>("#source-document");
const sourceDocumentCount = requiredElement<HTMLElement>("#source-document-count");
const pageFingerprint = requiredElement<HTMLElement>("#page-fingerprint");
const pageBindingReasons = requiredElement<HTMLElement>("#page-binding-reasons");
const sessionSelect = requiredElement<HTMLSelectElement>("#session-select");
const sessionName = requiredElement<HTMLInputElement>("#session-name");
const createSessionButton = requiredElement<HTMLButtonElement>("#create-session");
const workflowMode = requiredElement<HTMLSelectElement>("#workflow-mode");
const viewportProfile = requiredElement<HTMLSelectElement>("#viewport-profile");
const viewportLabel = requiredElement<HTMLInputElement>("#viewport-label");
const measuredViewport = requiredElement<HTMLElement>("#measured-viewport");
const pythonFeedGuardStatus = requiredElement<HTMLElement>("#python-feed-guard-status");
const openSourceOptionsButton = requiredElement<HTMLButtonElement>("#open-source-options");
const stepSource = requiredElement<HTMLElement>("#feed-step-source");
const stepDesktop = requiredElement<HTMLElement>("#feed-step-desktop");
const stepTablet = requiredElement<HTMLElement>("#feed-step-tablet");
const stepMobile = requiredElement<HTMLElement>("#feed-step-mobile");
const stepExport = requiredElement<HTMLElement>("#feed-step-export");
const screenshotToggle = requiredElement<HTMLInputElement>("#screenshot-toggle");
const textPreviewToggle = requiredElement<HTMLInputElement>("#text-preview-toggle");
const captureButton = requiredElement<HTMLButtonElement>("#capture-button");
const cancelButton = requiredElement<HTMLButtonElement>("#cancel-button");
const captureStatus = requiredElement<HTMLElement>("#capture-status");
const captureList = requiredElement<HTMLUListElement>("#capture-list");
const elementCount = requiredElement<HTMLElement>("#element-count");
const overflowCount = requiredElement<HTMLElement>("#overflow-count");
const diagnosticCount = requiredElement<HTMLElement>("#diagnostic-count");
const truncatedBranches = requiredElement<HTMLElement>("#truncated-branches");
const identityCollisions = requiredElement<HTMLElement>("#identity-collisions");
const skippedHiddenSubtrees = requiredElement<HTMLElement>("#skipped-hidden-subtrees");
const captureEnvironmentWarnings = requiredElement<HTMLElement>("#capture-environment-warnings");
const captureCompleteness = requiredElement<HTMLElement>("#capture-completeness");
const packageIntegrity = requiredElement<HTMLElement>("#package-integrity");
const partialReasonsBox = requiredElement<HTMLElement>("#partial-reasons-box");
const partialReasons = requiredElement<HTMLUListElement>("#partial-reasons");
const storageUsage = requiredElement<HTMLElement>("#storage-usage");
const privacySummary = requiredElement<HTMLElement>("#privacy-summary");
const exportButton = requiredElement<HTMLButtonElement>("#export-button");
const exportPythonFeedButton = requiredElement<HTMLButtonElement>("#export-python-feed-button");
const exportStatus = requiredElement<HTMLElement>("#export-status");
const exportPreflightDialog = requiredElement<HTMLDialogElement>("#export-preflight-dialog");
const exportPreflightList = requiredElement<HTMLUListElement>("#export-preflight-list");
const exportPreflightBlockersBox = requiredElement<HTMLElement>("#export-preflight-blockers-box");
const exportPreflightBlockingMessage = requiredElement<HTMLElement>(
  "#export-preflight-blocking-message",
);
const exportPreflightBlockers = requiredElement<HTMLUListElement>("#export-preflight-blockers");
const exportPreflightWarningsBox = requiredElement<HTMLElement>("#export-preflight-warnings-box");
const exportPreflightWarnings = requiredElement<HTMLUListElement>("#export-preflight-warnings");
const exportRuntimeInsteadButton = requiredElement<HTMLButtonElement>("#export-runtime-instead");
const confirmExportButton = requiredElement<HTMLButtonElement>("#confirm-export");
let activeJobId: string | null = null;
let currentSourceContext: SourceContextState = { imported: false };
let currentPageCapturable = false;
let latestProbe: PageProbeEvidence | null = null;
let latestGuard: PythonFeedCaptureGuard | null = null;

localizeDocument();
extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
void initialize().catch((error: unknown) => {
  setStatus(pageStatus, safeMessage(error), "error");
  captureButton.disabled = true;
});
let captureGuardRefreshTimer: number | null = null;

function scheduleCaptureGuardRefresh(delayMs = document.hidden ? 30_000 : 5_000): void {
  if (captureGuardRefreshTimer !== null) window.clearTimeout(captureGuardRefreshTimer);
  captureGuardRefreshTimer = window.setTimeout(() => {
    void runScheduledCaptureGuardRefresh();
  }, delayMs);
}

async function runScheduledCaptureGuardRefresh(): Promise<void> {
  captureGuardRefreshTimer = null;
  try {
    if (activeJobId === null && workflowMode.value === "MINIMUM_PYTHON_FEED")
      await refreshCaptureGuard();
  } finally {
    scheduleCaptureGuardRefresh();
  }
}

document.addEventListener("visibilitychange", () => {
  scheduleCaptureGuardRefresh(document.hidden ? 30_000 : 0);
});
scheduleCaptureGuardRefresh();

async function initialize(): Promise<void> {
  const [page, state, sourceContext] = await Promise.all([
    request<PageCheck>("PAGE_CHECK"),
    request<State>("STATE_GET"),
    request<SourceContextState>("SOURCE_CONTEXT_GET"),
  ]);
  currentSourceContext = sourceContext;
  setStatus(
    pageStatus,
    page.capturable
      ? chrome.i18n.getMessage("supported")
      : page.diagnostic
        ? diagnosticUiMessage(page.diagnostic)
        : chrome.i18n.getMessage("unsupported"),
    page.capturable ? "complete" : "error",
  );
  currentPageCapturable = page.capturable;
  renderState(state);
  await refreshCaptureGuard();
}

function renderState(state: State): void {
  const selected = state.currentSessionId ?? sessionSelect.value;
  clearChildren(sessionSelect);
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = chrome.i18n.getMessage("selectSession");
  sessionSelect.append(empty);
  for (const session of state.sessions) {
    const option = document.createElement("option");
    option.value = session.session_id;
    option.textContent = session.name;
    option.selected = session.session_id === selected;
    sessionSelect.append(option);
  }
  storageUsage.textContent = formatBytes(state.storageUsage);
  renderSession(state.currentSession ?? undefined);
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
      const badge = document.createElement("span");
      badge.className = `badge ${capture.completeness_status === "COMPLETE" ? "badge-complete" : "badge-partial"}`;
      badge.textContent = localizedCompleteness(capture.completeness_status);
      const details = document.createElement("p");
      details.className = "muted";
      details.textContent = `${capture.element_count} ${chrome.i18n.getMessage("elementsShort")} · ${capture.overflow_count} ${chrome.i18n.getMessage("overflowShort")} · ${capture.diagnostic_count} ${chrome.i18n.getMessage("diagnosticsShort")} · ${capture.capture_environment_warning_count} ${chrome.i18n.getMessage("environmentWarningsShort")}${capture.screenshot_available ? ` · ${chrome.i18n.getMessage("screenshotIncluded")}` : ""}`;
      item.append(title, badge, details);
      captureList.append(item);
    }
  }
  const latest = captures.at(-1);
  renderPageEvidenceCard(latest);
  actualViewport.textContent = latest
    ? `${latest.actual_width} × ${latest.actual_height}`
    : chrome.i18n.getMessage("notCaptured");
  elementCount.textContent = String(latest?.element_count ?? 0);
  overflowCount.textContent = String(latest?.overflow_count ?? 0);
  diagnosticCount.textContent = String(latest?.diagnostic_count ?? 0);
  truncatedBranches.textContent = String(latest?.truncated_branch_count ?? 0);
  identityCollisions.textContent = String(latest?.identity_collision_count ?? 0);
  skippedHiddenSubtrees.textContent = String(latest?.skipped_hidden_subtree_count ?? 0);
  captureEnvironmentWarnings.textContent = String(latest?.capture_environment_warning_count ?? 0);
  captureEnvironmentWarnings.dataset.kind =
    (latest?.capture_environment_warning_count ?? 0) > 0 ? "partial" : "complete";
  captureCompleteness.textContent = latest
    ? localizedCompleteness(latest.completeness_status)
    : "—";
  captureCompleteness.dataset.kind =
    latest?.completeness_status === "PARTIAL" ? "partial" : "complete";
  clearChildren(partialReasons);
  const reasons = latest?.partial_reasons ?? [];
  partialReasonsBox.hidden = reasons.length === 0;
  for (const reason of reasons) {
    const item = document.createElement("li");
    item.textContent = explainReason(reason);
    partialReasons.append(item);
  }
  packageIntegrity.textContent = chrome.i18n.getMessage("pendingExportValidation");
  packageIntegrity.dataset.kind = "pending";
  const sessionMode = session
    ? effectiveSessionWorkflowMode(session.data.workflow_mode, captures.length)
    : null;
  if (sessionMode) workflowMode.value = sessionMode;
  workflowMode.disabled = sessionMode !== null;
  const effectiveMode = sessionMode ?? selectedWorkflowMode();
  exportButton.hidden = false;
  exportPythonFeedButton.hidden = effectiveMode === "RUNTIME_EVIDENCE";
  exportButton.disabled = !session || captures.length === 0;
  exportPythonFeedButton.disabled = !session || captures.length === 0;
  updatePrivacySummary();
  renderFeedSteps(session, latestGuard);
}

function updatePrivacySummary(): void {
  privacySummary.textContent = [
    chrome.i18n.getMessage("privacyLocalOnly"),
    screenshotToggle.checked
      ? chrome.i18n.getMessage("privacyScreenshotEnabled")
      : chrome.i18n.getMessage("privacyScreenshotDisabled"),
    textPreviewToggle.checked
      ? chrome.i18n.getMessage("privacyTextEnabled")
      : chrome.i18n.getMessage("privacyTextDisabled"),
    chrome.i18n.getMessage("privacyAlwaysExcluded"),
  ].join("; ");
}

sessionSelect.addEventListener("change", () => {
  if (!sessionSelect.value) return;
  void request("SESSION_SELECT", { sessionId: sessionSelect.value }).then(async () => {
    await refreshState();
    await refreshCaptureGuard();
  });
});

createSessionButton.addEventListener("click", () => void createSession());

workflowMode.addEventListener("change", () => void refreshCaptureGuard());
openSourceOptionsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());

textPreviewToggle.addEventListener("change", () => {
  if (textPreviewToggle.checked && !window.confirm(chrome.i18n.getMessage("textPreviewWarning")))
    textPreviewToggle.checked = false;
  updatePrivacySummary();
});

screenshotToggle.addEventListener("change", () => {
  if (screenshotToggle.checked && !window.confirm(chrome.i18n.getMessage("privacyWarning")))
    screenshotToggle.checked = false;
  updatePrivacySummary();
});

captureButton.addEventListener("click", () => void startCapture());

cancelButton.addEventListener("click", () => {
  if (!activeJobId) return;
  void request("CAPTURE_CANCEL", { jobId: activeJobId }).then(() => {
    activeJobId = null;
    cancelButton.disabled = true;
    setStatus(captureStatus, chrome.i18n.getMessage("captureCancelled"), "ready");
  });
});

exportButton.addEventListener("click", () => void exportCurrentSession("RUNTIME_EVIDENCE"));
exportPythonFeedButton.addEventListener(
  "click",
  () => void exportCurrentSession("MINIMUM_PYTHON_FEED"),
);

viewportProfile.addEventListener("change", () => {
  const labels: Record<string, string> = {
    DESKTOP: chrome.i18n.getMessage("profileDesktop"),
    TABLET: chrome.i18n.getMessage("profileTablet"),
    MOBILE: chrome.i18n.getMessage("profileMobile"),
    CUSTOM: chrome.i18n.getMessage("profileCustom"),
  };
  viewportLabel.value = labels[viewportProfile.value] ?? viewportProfile.value;
  void refreshCaptureGuard();
});

async function createSession(): Promise<void> {
  const name = sessionName.value.trim();
  if (!name) return;
  await request("SESSION_CREATE", { name });
  await refreshState();
  sessionSelect.focus();
  await refreshCaptureGuard();
}

async function startCapture(): Promise<void> {
  if (!sessionSelect.value) {
    setStatus(captureStatus, chrome.i18n.getMessage("selectSessionFirst"), "error");
    return;
  }
  const selectedMode = selectedWorkflowMode();
  if (selectedMode === "MINIMUM_PYTHON_FEED") {
    const guard = await request<PythonFeedCaptureGuard>("PYTHON_FEED_CAPTURE_CHECK", {
      sessionId: sessionSelect.value,
      requestedProfileId: selectedViewportProfile(),
    });
    latestGuard = guard;
    renderCaptureGuard(guard);
    if (!guard.allowed) return;
  }
  captureButton.disabled = true;
  cancelButton.disabled = false;
  setStatus(captureStatus, chrome.i18n.getMessage("statusWorking"), "working");
  try {
    const job = await request<CaptureJob>("CAPTURE_START", {
      sessionId: sessionSelect.value,
      userLabel: viewportLabel.value.trim() || chrome.i18n.getMessage("currentViewport"),
      evidenceLabel: "USER_LABELED_VIEWPORT",
      requestedProfileId: selectedViewportProfile(),
      workflowMode: selectedMode,
      overrides: {
        includeScreenshot: screenshotToggle.checked,
        includeTextPreview: textPreviewToggle.checked,
      },
    });
    activeJobId = job.id;
    await waitForCompletion(job.id);
  } catch (error: unknown) {
    setStatus(captureStatus, safeMessage(error), "error");
  } finally {
    activeJobId = null;
    cancelButton.disabled = true;
    await refreshCaptureGuard();
  }
}

function selectedWorkflowMode(): CaptureWorkflowMode {
  if (workflowMode.value === "RUNTIME_EVIDENCE" || workflowMode.value === "MINIMUM_PYTHON_FEED")
    return workflowMode.value;
  throw new Error("The selected capture workflow is invalid.");
}

async function refreshCaptureGuard(): Promise<void> {
  if (!currentPageCapturable) {
    captureButton.disabled = true;
    return;
  }
  try {
    currentSourceContext = await request<SourceContextState>("SOURCE_CONTEXT_GET");
    if (selectedWorkflowMode() === "RUNTIME_EVIDENCE") {
      latestProbe = await request<PageProbeEvidence>("PAGE_PROBE");
      measuredViewport.textContent = `${latestProbe.inner_width} × ${latestProbe.inner_height}`;
      latestGuard = null;
      captureButton.disabled = !sessionSelect.value;
      setStatus(
        pythonFeedGuardStatus,
        chrome.i18n.getMessage("runtimeEvidenceCaptureAvailable"),
        "complete",
      );
      const state = await request<State>("STATE_GET");
      renderFeedSteps(state.currentSession ?? undefined, null);
      return;
    }
    if (!sessionSelect.value) {
      latestGuard = null;
      captureButton.disabled = true;
      setStatus(pythonFeedGuardStatus, chrome.i18n.getMessage("selectSessionFirst"), "error");
      renderFeedSteps(undefined, null);
      return;
    }
    const guard = await request<PythonFeedCaptureGuard>("PYTHON_FEED_CAPTURE_CHECK", {
      sessionId: sessionSelect.value,
      requestedProfileId: selectedViewportProfile(),
    });
    latestGuard = guard;
    renderCaptureGuard(guard);
    const state = await request<State>("STATE_GET");
    renderFeedSteps(state.currentSession ?? undefined, guard);
  } catch (error: unknown) {
    latestGuard = null;
    captureButton.disabled = true;
    setStatus(pythonFeedGuardStatus, safeMessage(error), "error");
  }
}

function renderCaptureGuard(guard: PythonFeedCaptureGuard): void {
  measuredViewport.textContent = `${guard.measured_viewport.width} × ${guard.measured_viewport.height}`;
  captureButton.disabled = !guard.allowed;
  setStatus(
    pythonFeedGuardStatus,
    guard.allowed
      ? chrome.i18n.getMessage("pythonFeedCaptureAvailable")
      : guard.blocking_codes.map(captureGuardMessage).join(" · "),
    guard.allowed ? "complete" : "error",
  );
}

function captureGuardMessage(code: string): string {
  const keyByCode: Record<string, string> = {
    EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED: "feedGuardSourceRequired",
    EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE: "feedGuardSourceIncompatible",
    EDIS_RUNTIME_DUPLICATE_MEASURED_VIEWPORT: "feedGuardDuplicateWidth",
    EDIS_RUNTIME_REQUIRED_PROFILE_ALREADY_CAPTURED: "feedGuardDuplicateProfile",
    EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING: "feedGuardRequiredProfile",
    EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH: "feedGuardPageMismatch",
    EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL: "feedGuardCanonicalScroll",
    EDIS_RUNTIME_PAGE_NOT_VISIBLE: "feedGuardPageNotVisible",
    EDIS_RUNTIME_PAGE_PRERENDERING: "feedGuardPagePrerendering",
    EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS: "feedGuardAdminBar",
    EDIS_RUNTIME_ELEMENTOR_EDITOR_PREVIEW_NOT_CANONICAL: "feedGuardElementorEditor",
    EDIS_RUNTIME_IFRAME_CAPTURE_NOT_CANONICAL: "feedGuardIframe",
    EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY: "feedGuardImagesNotReady",
    EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH: "feedGuardWorkflowModeMismatch",
  };
  const key = keyByCode[code];
  return key ? chrome.i18n.getMessage(key) : code;
}

function renderFeedSteps(
  session: CaptureSession | undefined,
  guard: PythonFeedCaptureGuard | null,
): void {
  const captures = session?.data.captures ?? [];
  const profiles = new Set(guard?.existing_requested_profiles ?? []);
  setStep(stepSource, currentSourceContext.imported && currentSourceContext.selectedDocumentId);
  setStep(stepDesktop, profiles.has("DESKTOP"));
  setStep(stepTablet, profiles.has("TABLET"));
  setStep(stepMobile, profiles.has("MOBILE"));
  setStep(
    stepExport,
    captures.length >= 3 &&
      profiles.has("DESKTOP") &&
      profiles.has("TABLET") &&
      profiles.has("MOBILE"),
  );
}

function setStep(element: HTMLElement, complete: unknown): void {
  element.dataset.kind = complete ? "complete" : "pending";
}

function selectedViewportProfile(): RequestedViewportProfile {
  if (!isRequestedViewportProfile(viewportProfile.value))
    throw new Error("The selected viewport profile is invalid.");
  return viewportProfile.value;
}

async function waitForCompletion(jobId: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let pollDelayMs = 250;
  while (Date.now() < deadline) {
    await delay(pollDelayMs);
    const job = await request<CaptureJob | undefined>("CAPTURE_STATUS", { jobId });
    if (!job) throw new Error(chrome.i18n.getMessage("captureJobMissing"));
    setStatus(
      captureStatus,
      `${chrome.i18n.getMessage("captureStatusLabel")}: ${job.status}`,
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
      throw new Error(lastDiagnosticMessage(job) ?? `Capture ended with ${job.status}.`);
    pollDelayMs = Math.min(Math.ceil(pollDelayMs * 1.5), 2_000);
  }
  throw new Error(chrome.i18n.getMessage("captureTimeout"));
}

async function exportCurrentSession(purpose: ExportPurpose): Promise<void> {
  const sessionId = sessionSelect.value;
  if (!sessionId) return;
  exportButton.disabled = true;
  exportPythonFeedButton.disabled = true;
  try {
    const preflight = await getExportPreflight(sessionId, purpose);
    const confirmedPurpose = await confirmExportPreflight(preflight);
    if (confirmedPurpose === null) return;
    setStatus(exportStatus, chrome.i18n.getMessage("validatingPackage"), "working");
    const result = await exportSession(sessionId, confirmedPurpose);
    packageIntegrity.textContent = chrome.i18n.getMessage("validatedPass");
    packageIntegrity.dataset.kind = "complete";
    setStatus(
      exportStatus,
      `${result.filename} · ${result.entryCount} ${chrome.i18n.getMessage("entries")} · ${chrome.i18n.getMessage("validationPassed")}`,
      "complete",
    );
    await request("EXPORT_COMPLETE", { sessionId });
    await refreshState();
  } catch (error: unknown) {
    packageIntegrity.textContent = chrome.i18n.getMessage("validationFailed");
    packageIntegrity.dataset.kind = "partial";
    setStatus(exportStatus, safeMessage(error), "error");
  } finally {
    exportButton.disabled = false;
    exportPythonFeedButton.disabled = false;
  }
}

async function confirmExportPreflight(
  report: ExportPreflightReport,
): Promise<ExportPurpose | null> {
  clearChildren(exportPreflightList);
  clearChildren(exportPreflightBlockers);
  clearChildren(exportPreflightWarnings);
  const rows = [
    chrome.i18n.getMessage("preflightObservations", [String(report.observations)]),
    chrome.i18n.getMessage("preflightRuntimeNodes", [String(report.runtimeNodes)]),
    chrome.i18n.getMessage("preflightDistinctViewports", [String(report.distinctViewports)]),
    chrome.i18n.getMessage("preflightDistinctViewportWidths", [
      String(report.distinctViewportWidths),
    ]),
    chrome.i18n.getMessage("preflightPythonFeedReadiness", [report.pythonFeedReadiness]),
    chrome.i18n.getMessage("preflightRequestedProfiles", [
      report.requestedProfilesPresent.join(", ") || "—",
    ]),
    chrome.i18n.getMessage("preflightScreenshots", [String(report.screenshots)]),
    chrome.i18n.getMessage(
      report.sourceContextImported ? "preflightSourceAvailable" : "preflightSourceMissing",
    ),
    chrome.i18n.getMessage("preflightIncompleteImages", [String(report.incompleteImagesTotal)]),
  ];
  for (const text of rows) {
    const item = document.createElement("li");
    item.textContent = text;
    exportPreflightList.append(item);
  }
  for (const warning of report.warnings) {
    const item = document.createElement("li");
    item.textContent = preflightWarningMessage(warning);
    exportPreflightWarnings.append(item);
  }
  for (const blocking of report.blockingErrors) {
    const item = document.createElement("li");
    item.textContent = preflightWarningMessage(blocking);
    exportPreflightBlockers.append(item);
  }

  const viewState = makeExportPreflightViewState(report);
  exportPreflightBlockersBox.hidden = !viewState.hasBlockers;
  exportPreflightWarningsBox.hidden = !viewState.showWarnings;
  exportPreflightBlockingMessage.textContent = viewState.blockingMessageKey
    ? chrome.i18n.getMessage(viewState.blockingMessageKey)
    : "";
  confirmExportButton.disabled = viewState.confirmDisabled;
  confirmExportButton.textContent = chrome.i18n.getMessage(
    report.purpose === "MINIMUM_PYTHON_FEED" ? "exportPythonFeed" : "exportAnyway",
  );
  exportRuntimeInsteadButton.hidden = !viewState.showRuntimeFallback;
  exportPreflightDialog.returnValue = "cancel";
  exportPreflightDialog.showModal();
  return await new Promise<ExportPurpose | null>((resolve) => {
    exportPreflightDialog.addEventListener(
      "close",
      () => {
        if (exportPreflightDialog.returnValue === "export") resolve(report.purpose);
        else if (exportPreflightDialog.returnValue === "runtime-evidence")
          resolve("RUNTIME_EVIDENCE");
        else resolve(null);
      },
      { once: true },
    );
  });
}

function preflightWarningMessage(code: string): string {
  const keyByCode: Record<string, string> = {
    SOURCE_CONTEXT_NOT_IMPORTED: "preflightWarningSourceContext",
    SINGLE_VIEWPORT_ONLY: "preflightWarningSingleViewport",
    SCREENSHOT_NOT_REQUESTED: "preflightWarningScreenshot",
    HIDDEN_ELEMENTS_EXCLUDED: "preflightWarningHidden",
    INCOMPLETE_IMAGES_OBSERVED: "preflightWarningImages",
    NO_RUNTIME_OBSERVATIONS: "preflightBlockingNoObservations",
    SESSION_CAPTURE_IN_PROGRESS: "preflightBlockingCaptureInProgress",
    SESSION_FAILED: "preflightBlockingSessionFailed",
    EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED: "preflightBlockingSourceRequired",
    EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE: "preflightBlockingSourceIncompatible",
    EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS: "preflightBlockingObservations",
    EDIS_RUNTIME_INSUFFICIENT_DISTINCT_VIEWPORTS: "preflightBlockingDistinctWidths",
    EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING: "preflightBlockingProfiles",
    EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH: "preflightBlockingPageMismatch",
    EDIS_RUNTIME_SOURCE_CONTEXT_REFERENCE_MISMATCH: "preflightBlockingSourceMismatch",
    EDIS_RUNTIME_OBSERVATION_INDEX_INVALID: "preflightBlockingObservationIndex",
    EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL: "preflightBlockingCanonicalScroll",
    EDIS_RUNTIME_PAGE_NOT_VISIBLE: "preflightBlockingPageNotVisible",
    EDIS_RUNTIME_PAGE_PRERENDERING: "preflightBlockingPagePrerendering",
    EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS: "preflightBlockingAdminBar",
    EDIS_RUNTIME_ELEMENTOR_EDITOR_PREVIEW_NOT_CANONICAL: "preflightBlockingElementorEditor",
    EDIS_RUNTIME_IFRAME_CAPTURE_NOT_CANONICAL: "preflightBlockingIframe",
    EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY: "preflightBlockingImagesNotReady",
    EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH: "preflightBlockingWorkflowMode",
    EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED: "preflightBlockingStorageBudget",
    EDIS_RUNTIME_READINESS_ERROR: "preflightBlockingReadinessError",
  };
  const key = keyByCode[code];
  return key ? chrome.i18n.getMessage(key) : code;
}

async function refreshState(): Promise<void> {
  const [state, sourceContext] = await Promise.all([
    request<State>("STATE_GET"),
    request<SourceContextState>("SOURCE_CONTEXT_GET"),
  ]);
  currentSourceContext = sourceContext;
  renderState(state);
}

function renderPageEvidenceCard(
  latest: CaptureSession["data"]["captures"][number] | undefined,
): void {
  sourceContextState.textContent = chrome.i18n.getMessage(
    currentSourceContext.imported ? "sourceContextImported" : "sourceContextNotImported",
  );
  sourceContextState.dataset.kind = currentSourceContext.imported ? "complete" : "pending";

  pageBindingState.textContent = latest?.page_binding_state ?? "UNMATCHED";
  pageBindingState.dataset.kind =
    latest?.page_binding_state === "EXACT"
      ? "complete"
      : latest?.page_binding_state === "AMBIGUOUS"
        ? "partial"
        : "pending";

  const selectedDocument =
    latest?.source_document_id ?? currentSourceContext.selectedDocumentId ?? null;
  const selectedMetadata = currentSourceContext.documents?.find(
    (item) => item.documentId === selectedDocument,
  );
  sourceDocument.textContent = selectedDocument
    ? `${selectedMetadata?.documentType ?? latest?.source_document_type ?? "document"} · ${selectedDocument}`
    : chrome.i18n.getMessage("notAvailable");
  sourceDocumentCount.textContent = String(latest?.source_document_count ?? 0);
  pageFingerprint.textContent = latest ? compactHash(latest.page_fingerprint) : "—";

  const reasons = latest?.page_binding_reason_codes ?? [];
  const structure = latest
    ? chrome.i18n.getMessage("structureSummary", [
        String(latest.source_section_count),
        String(latest.runtime_section_region_count),
        String(latest.runtime_container_region_count),
        String(latest.runtime_widget_marker_count),
        String(latest.source_widget_count),
        String(latest.runtime_region_count),
      ])
    : "";
  const reasonText = reasons.length
    ? chrome.i18n.getMessage("bindingReasonsLabel", [reasons.join(", ")])
    : "";
  pageBindingReasons.textContent = [structure, reasonText].filter(Boolean).join(" · ");
}

function compactHash(value: string): string {
  if (value.length <= 25) return value;
  return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function localizedCompleteness(value: "COMPLETE" | "PARTIAL"): string {
  return chrome.i18n.getMessage(
    value === "COMPLETE" ? "completenessComplete" : "completenessPartial",
  );
}

function explainReason(code: string): string {
  const keyByCode: Readonly<Record<string, string>> = {
    EDIS_RUNTIME_DEPTH_LIMIT_REACHED: "reasonDepthLimit",
    EDIS_RUNTIME_ELEMENT_LIMIT_REACHED: "reasonElementLimit",
    EDIS_RUNTIME_SCAN_LIMIT_REACHED: "reasonScanLimit",
    EDIS_RUNTIME_IDENTITY_COLLISION: "reasonIdentityCollision",
    EDIS_RUNTIME_PARTIAL_IDENTITY: "reasonPartialIdentity",
    EDIS_RUNTIME_NON_FINITE_GEOMETRY: "reasonGeometry",
    EDIS_RUNTIME_SCREENSHOT_FAILED: "reasonScreenshot",
    EDIS_RUNTIME_READINESS_UNSTABLE: "reasonReadinessUnstable",
  };
  const key = keyByCode[code];
  return key ? chrome.i18n.getMessage(key) : code;
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
