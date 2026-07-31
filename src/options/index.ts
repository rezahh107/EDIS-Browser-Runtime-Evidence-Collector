import {
  DEEP_DOM_CAPTURE_LIMITS,
  STANDARD_CAPTURE_LIMITS,
  type CaptureIntent,
  type CaptureProfile,
  type CollectorPreferences,
} from "../domain/model";
import { formatBytes, localizeDocument, request, requiredElement, setStatus } from "../shared/ui";

interface State {
  readonly storageUsage: number;
}
interface SourceContextState {
  readonly imported: boolean;
  readonly importedAt?: string;
  readonly selectedDocumentId?: string | null;
  readonly documents?: readonly {
    documentId: string;
    documentType: string;
    elementCount: number;
  }[];
  readonly wordpressBundleId?: string;
  readonly sourceExportRootSha256?: string;
}

const form = requiredElement<HTMLFormElement>("#options-form");
const captureProfile = requiredElement<HTMLSelectElement>("#capture-profile");
const captureIntent = requiredElement<HTMLSelectElement>("#capture-intent");
const redactionMode = requiredElement<HTMLSelectElement>("#redaction-mode");
const includeScreenshot = requiredElement<HTMLInputElement>("#include-screenshot");
const includeHidden = requiredElement<HTMLInputElement>("#include-hidden");
const includePath = requiredElement<HTMLInputElement>("#include-path");
const includeTitle = requiredElement<HTMLInputElement>("#include-title");
const includeColors = requiredElement<HTMLInputElement>("#include-colors");
const includeTextPreview = requiredElement<HTMLInputElement>("#include-text-preview");
const includeTextShape = requiredElement<HTMLInputElement>("#include-text-shape");
const includeInteractionFacts = requiredElement<HTMLInputElement>("#include-interaction-facts");
const includeRelationshipGraph = requiredElement<HTMLInputElement>("#include-relationship-graph");
const prepareFullDocumentImages = requiredElement<HTMLInputElement>(
  "#prepare-full-document-images",
);
const maxElements = requiredElement<HTMLInputElement>("#max-elements");
const maxDepth = requiredElement<HTMLInputElement>("#max-depth");
const maxSnapshot = requiredElement<HTMLInputElement>("#max-snapshot");
const maxTextPreview = requiredElement<HTMLInputElement>("#max-text-preview");
const readinessTimeout = requiredElement<HTMLInputElement>("#readiness-timeout");
const saveStatus = requiredElement<HTMLElement>("#save-status");
const storageUsage = requiredElement<HTMLElement>("#storage-usage");
const versionValue = requiredElement<HTMLElement>("#version-value");
const clearData = requiredElement<HTMLButtonElement>("#clear-data");
const clearDialog = requiredElement<HTMLDialogElement>("#clear-dialog");
const confirmClear = requiredElement<HTMLButtonElement>("#confirm-clear");
const sourceContextFile = requiredElement<HTMLInputElement>("#source-context-file");
const sourceDocumentId = requiredElement<HTMLInputElement>("#source-document-id");
const importSourceContextButton = requiredElement<HTMLButtonElement>("#import-source-context");
const clearSourceContextButton = requiredElement<HTMLButtonElement>("#clear-source-context");
const sourceContextStatus = requiredElement<HTMLElement>("#source-context-status");
const sourceContextSummary = requiredElement<HTMLElement>("#source-context-summary");
let clearTrigger: HTMLElement | null = null;

localizeDocument();
void initialize().catch((error: unknown) => setStatus(saveStatus, safeMessage(error), "error"));

async function initialize(): Promise<void> {
  const [preferences, state, context] = await Promise.all([
    request<CollectorPreferences>("OPTIONS_GET"),
    request<State>("STATE_GET"),
    request<SourceContextState>("SOURCE_CONTEXT_GET"),
  ]);
  applyPreferences(preferences);
  renderSourceContext(context);
  storageUsage.textContent = formatBytes(state.storageUsage);
  versionValue.textContent = chrome.runtime.getManifest().version;
}

function applyPreferences(value: CollectorPreferences): void {
  captureProfile.value = value.captureProfile;
  captureIntent.value = value.captureIntent;
  redactionMode.value = value.redactionMode;
  includeScreenshot.checked = value.includeScreenshot;
  includeHidden.checked = value.includeHiddenElements;
  includePath.checked = value.includePath;
  includeTitle.checked = value.includePageTitle;
  includeColors.checked = value.includeColors;
  includeTextPreview.checked = value.includeTextPreview;
  includeTextShape.checked = value.includeTextShape;
  includeInteractionFacts.checked = value.includeInteractionFacts;
  includeRelationshipGraph.checked = value.includeRelationshipGraph;
  prepareFullDocumentImages.checked = value.prepareFullDocumentImages;
  maxElements.valueAsNumber = value.maxElements;
  maxDepth.valueAsNumber = value.maxDepth;
  maxSnapshot.valueAsNumber = value.maxSnapshotBytes;
  maxTextPreview.valueAsNumber = value.maxTextPreviewChars;
  readinessTimeout.valueAsNumber = value.readinessHardTimeoutMs;
  updateProfileControls(false);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});
captureProfile.addEventListener("change", () => updateProfileControls(true));
includeScreenshot.addEventListener("change", () => confirmSensitive(includeScreenshot));
includeTextPreview.addEventListener("change", () => confirmSensitive(includeTextPreview));
clearData.addEventListener("click", () => {
  clearTrigger = clearData;
  clearDialog.showModal();
});
clearDialog.addEventListener("close", () => {
  if (clearDialog.returnValue === "confirm") void clearAll();
  clearTrigger?.focus();
});
confirmClear.addEventListener("click", () => {
  clearDialog.returnValue = "confirm";
});
importSourceContextButton.addEventListener("click", () => void importSourceContext());
clearSourceContextButton.addEventListener("click", () => void clearSourceContext());

async function save(): Promise<void> {
  const preferences: CollectorPreferences = {
    schemaVersion: 5,
    captureProfile: normalizeCaptureProfile(captureProfile.value),
    captureIntent: normalizeCaptureIntent(captureIntent.value),
    redactionMode: normalizeMode(redactionMode.value),
    includeScreenshot: includeScreenshot.checked,
    includeHiddenElements: includeHidden.checked,
    includePath: includePath.checked,
    includePageTitle: includeTitle.checked,
    includeColors: includeColors.checked,
    includeTextPreview: includeTextPreview.checked,
    includeTextShape: includeTextShape.checked,
    includeInteractionFacts: includeInteractionFacts.checked,
    includeRelationshipGraph: includeRelationshipGraph.checked,
    prepareFullDocumentImages: prepareFullDocumentImages.checked,
    readinessHardTimeoutMs: readinessTimeout.valueAsNumber,
    maxTextPreviewChars: maxTextPreview.valueAsNumber,
    maxElements: maxElements.valueAsNumber,
    maxDepth: maxDepth.valueAsNumber,
    maxSnapshotBytes: maxSnapshot.valueAsNumber,
  };
  try {
    await request("OPTIONS_SAVE", { preferences });
    setStatus(saveStatus, chrome.i18n.getMessage("optionsSaved"), "complete");
  } catch (error: unknown) {
    setStatus(saveStatus, safeMessage(error), "error");
  }
}

async function importSourceContext(): Promise<void> {
  const file = sourceContextFile.files?.item(0);
  if (!file) {
    setStatus(sourceContextStatus, "Choose source-context.json first.", "error");
    return;
  }
  if (file.size > 5_000_000) {
    setStatus(sourceContextStatus, "The context exceeds the 5 MB limit.", "error");
    return;
  }
  importSourceContextButton.disabled = true;
  try {
    const state = await request<SourceContextState>("SOURCE_CONTEXT_IMPORT", {
      text: await file.text(),
      selectedDocumentId: sourceDocumentId.value.trim() || null,
    });
    renderSourceContext({ ...state, imported: true });
    setStatus(sourceContextStatus, "Source Context imported and validated locally.", "complete");
  } catch (error: unknown) {
    setStatus(sourceContextStatus, safeMessage(error), "error");
  } finally {
    importSourceContextButton.disabled = false;
  }
}
async function clearSourceContext(): Promise<void> {
  await request("SOURCE_CONTEXT_CLEAR");
  sourceContextFile.value = "";
  sourceDocumentId.value = "";
  renderSourceContext({ imported: false });
  setStatus(sourceContextStatus, "Imported Source Context removed.", "complete");
}
function renderSourceContext(state: SourceContextState): void {
  sourceContextSummary.textContent = "";
  if (!state.imported) {
    sourceContextSummary.textContent =
      "No WordPress Source Context is imported. Browser-only capture remains valid.";
    return;
  }
  const lines = [
    `WordPress bundle: ${state.wordpressBundleId ?? "unknown"}`,
    `Selected document: ${state.selectedDocumentId ?? "not selected"}`,
    `Documents: ${state.documents?.length ?? 0}`,
    `Source root: ${state.sourceExportRootSha256 ?? "unknown"}`,
  ];
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    sourceContextSummary.append(p);
  }
}

async function clearAll(): Promise<void> {
  try {
    await request("CLEAR_ALL_DATA");
    const preferences = await request<CollectorPreferences>("OPTIONS_GET");
    applyPreferences(preferences);
    renderSourceContext({ imported: false });
    storageUsage.textContent = "0 B";
    setStatus(saveStatus, chrome.i18n.getMessage("allDataCleared"), "complete");
  } catch (error: unknown) {
    setStatus(saveStatus, safeMessage(error), "error");
  }
}
function updateProfileControls(applyPreset: boolean): void {
  const profile = normalizeCaptureProfile(captureProfile.value);
  if (applyPreset && profile === "STANDARD") {
    maxElements.valueAsNumber = STANDARD_CAPTURE_LIMITS.maxElements;
    maxDepth.valueAsNumber = STANDARD_CAPTURE_LIMITS.maxDepth;
  }
  if (applyPreset && profile === "DEEP_DOM") {
    maxElements.valueAsNumber = DEEP_DOM_CAPTURE_LIMITS.maxElements;
    maxDepth.valueAsNumber = DEEP_DOM_CAPTURE_LIMITS.maxDepth;
  }
  const custom = profile === "CUSTOM";
  maxElements.disabled = !custom;
  maxDepth.disabled = !custom;
}
function confirmSensitive(input: HTMLInputElement): void {
  if (input.checked && !window.confirm(chrome.i18n.getMessage("privacyWarning")))
    input.checked = false;
}
function normalizeMode(value: string): CollectorPreferences["redactionMode"] {
  return value === "STANDARD" || value === "DIAGNOSTIC" ? value : "STRICT";
}
function normalizeCaptureProfile(value: string): CaptureProfile {
  return value === "DEEP_DOM" || value === "CUSTOM" ? value : "STANDARD";
}
function normalizeCaptureIntent(value: string): CaptureIntent {
  return [
    "RESPONSIVE_COMPARISON",
    "TYPOGRAPHY_AUDIT",
    "INTERACTION_AUDIT",
    "OVERFLOW_INVESTIGATION",
  ].includes(value)
    ? (value as CaptureIntent)
    : "GENERAL_AUDIT";
}
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed safely.";
}
