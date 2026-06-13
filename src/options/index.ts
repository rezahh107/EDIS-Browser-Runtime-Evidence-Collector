import type { CollectorPreferences } from "../domain/model";
import { formatBytes, localizeDocument, request, requiredElement, setStatus } from "../shared/ui";

interface State {
  readonly storageUsage: number;
}

const form = requiredElement<HTMLFormElement>("#options-form");
const redactionMode = requiredElement<HTMLSelectElement>("#redaction-mode");
const includeText = requiredElement<HTMLInputElement>("#include-text");
const includeScreenshot = requiredElement<HTMLInputElement>("#include-screenshot");
const includeHidden = requiredElement<HTMLInputElement>("#include-hidden");
const includeAccessibility = requiredElement<HTMLInputElement>("#include-accessibility");
const includePath = requiredElement<HTMLInputElement>("#include-path");
const includeTitle = requiredElement<HTMLInputElement>("#include-title");
const includeColors = requiredElement<HTMLInputElement>("#include-colors");
const retainAfterExport = requiredElement<HTMLInputElement>("#retain-after-export");
const maxElements = requiredElement<HTMLInputElement>("#max-elements");
const maxDepth = requiredElement<HTMLInputElement>("#max-depth");
const maxSnapshot = requiredElement<HTMLInputElement>("#max-snapshot");
const maxPreview = requiredElement<HTMLInputElement>("#max-preview");
const saveStatus = requiredElement<HTMLElement>("#save-status");
const storageUsage = requiredElement<HTMLElement>("#storage-usage");
const versionValue = requiredElement<HTMLElement>("#version-value");
const clearData = requiredElement<HTMLButtonElement>("#clear-data");
const clearDialog = requiredElement<HTMLDialogElement>("#clear-dialog");
const confirmClear = requiredElement<HTMLButtonElement>("#confirm-clear");
let clearTrigger: HTMLElement | null = null;

localizeDocument();
void initialize();

async function initialize(): Promise<void> {
  const [preferences, state] = await Promise.all([
    request<CollectorPreferences>("OPTIONS_GET"),
    request<State>("STATE_GET"),
  ]);
  applyPreferences(preferences);
  storageUsage.textContent = formatBytes(state.storageUsage);
  versionValue.textContent = chrome.runtime.getManifest().version;
}

function applyPreferences(value: CollectorPreferences): void {
  redactionMode.value = value.redactionMode;
  includeText.checked = value.includeTextPreview;
  includeScreenshot.checked = value.includeScreenshot;
  includeHidden.checked = value.includeHiddenElements;
  includeAccessibility.checked = value.includeAccessibilityMetadata;
  includePath.checked = value.includePath;
  includeTitle.checked = value.includePageTitle;
  includeColors.checked = value.includeColors;
  retainAfterExport.checked = value.retainAfterExport;
  maxElements.valueAsNumber = value.maxElements;
  maxDepth.valueAsNumber = value.maxDepth;
  maxSnapshot.valueAsNumber = value.maxSnapshotBytes;
  maxPreview.valueAsNumber = value.maxTextPreviewLength;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

includeScreenshot.addEventListener("change", () => confirmSensitive(includeScreenshot));
includeText.addEventListener("change", () => confirmSensitive(includeText));

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

async function save(): Promise<void> {
  const preferences: CollectorPreferences = {
    schemaVersion: 1,
    redactionMode: normalizeMode(redactionMode.value),
    includeTextPreview: includeText.checked,
    includeScreenshot: includeScreenshot.checked,
    includeHiddenElements: includeHidden.checked,
    includeAccessibilityMetadata: includeAccessibility.checked,
    includePath: includePath.checked,
    includePageTitle: includeTitle.checked,
    includeColors: includeColors.checked,
    retainAfterExport: retainAfterExport.checked,
    maxElements: maxElements.valueAsNumber,
    maxDepth: maxDepth.valueAsNumber,
    maxSnapshotBytes: maxSnapshot.valueAsNumber,
    maxTextPreviewLength: maxPreview.valueAsNumber,
  };
  try {
    await request("OPTIONS_SAVE", { preferences });
    setStatus(saveStatus, chrome.i18n.getMessage("statusComplete"), "complete");
  } catch (error: unknown) {
    setStatus(saveStatus, safeMessage(error), "error");
  }
}

async function clearAll(): Promise<void> {
  await request("CLEAR_ALL_DATA");
  const preferences = await request<CollectorPreferences>("OPTIONS_GET");
  applyPreferences(preferences);
  storageUsage.textContent = "0 B";
  setStatus(saveStatus, "All extension data was cleared.", "complete");
}

function confirmSensitive(input: HTMLInputElement): void {
  if (input.checked && !window.confirm(chrome.i18n.getMessage("privacyWarning")))
    input.checked = false;
}

function normalizeMode(value: string): CollectorPreferences["redactionMode"] {
  return value === "STANDARD" || value === "DIAGNOSTIC" ? value : "STRICT";
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed safely.";
}
