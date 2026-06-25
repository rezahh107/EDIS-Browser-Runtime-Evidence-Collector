import {
  DEEP_DOM_CAPTURE_LIMITS,
  DEFAULT_PREFERENCES,
  STANDARD_CAPTURE_LIMITS,
  type CollectorPreferences,
} from "../../domain/model";
import { isPreferences, isRecord } from "../../domain/validation";

const KEY = "collectorPreferences";

export async function loadPreferences(): Promise<CollectorPreferences> {
  const stored = await chrome.storage.local.get(KEY);
  const candidate = stored[KEY];
  if (isPreferences(candidate)) return candidate;
  const migrated = migratePreferences(candidate);
  if (migrated) {
    await chrome.storage.local.set({ [KEY]: migrated });
    return migrated;
  }
  return DEFAULT_PREFERENCES;
}
export async function savePreferences(preferences: CollectorPreferences): Promise<void> {
  if (!isPreferences(preferences)) throw new Error("Invalid preferences.");
  await chrome.storage.local.set({ [KEY]: preferences });
}
export async function clearPreferences(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

function migratePreferences(value: unknown): CollectorPreferences | null {
  if (!isRecord(value) || ![1, 2, 3].includes(Number(value.schemaVersion))) return null;
  const maxElements = validInteger(value.maxElements, 1_000) ?? STANDARD_CAPTURE_LIMITS.maxElements;
  const maxDepth = validInteger(value.maxDepth, 64) ?? STANDARD_CAPTURE_LIMITS.maxDepth;
  const captureProfile =
    maxElements === STANDARD_CAPTURE_LIMITS.maxElements &&
    maxDepth === STANDARD_CAPTURE_LIMITS.maxDepth
      ? "STANDARD"
      : maxElements === DEEP_DOM_CAPTURE_LIMITS.maxElements &&
          maxDepth === DEEP_DOM_CAPTURE_LIMITS.maxDepth
        ? "DEEP_DOM"
        : "CUSTOM";
  const migrated: CollectorPreferences = {
    ...DEFAULT_PREFERENCES,
    schemaVersion: 4,
    captureProfile,
    redactionMode:
      value.redactionMode === "STANDARD" || value.redactionMode === "DIAGNOSTIC"
        ? value.redactionMode
        : "STRICT",
    includeScreenshot: value.includeScreenshot === true,
    includeHiddenElements: value.includeHiddenElements === true,
    includePath: value.includePath === true,
    includePageTitle: value.includePageTitle === true,
    includeColors: value.includeColors === true,
    includeTextPreview: value.includeTextPreview === true,
    prepareFullDocumentImages: value.prepareFullDocumentImages === true,
    maxTextPreviewChars: validInteger(value.maxTextPreviewChars, 500) ?? 160,
    retainAfterExport: value.retainAfterExport === true,
    maxElements,
    maxDepth,
    maxSnapshotBytes: validInteger(value.maxSnapshotBytes, 32_000_000) ?? 12_000_000,
  };
  return isPreferences(migrated) ? migrated : null;
}
function validInteger(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : null;
}
