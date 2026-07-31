import {
  DEEP_DOM_CAPTURE_LIMITS,
  DEFAULT_PREFERENCES,
  STANDARD_CAPTURE_LIMITS,
  type CaptureIntent,
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
  if (!isRecord(value) || ![1, 2, 3, 4].includes(Number(value.schemaVersion))) return null;
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
    schemaVersion: 5,
    captureProfile,
    captureIntent: validCaptureIntent(value.captureIntent) ?? DEFAULT_PREFERENCES.captureIntent,
    redactionMode:
      value.redactionMode === "STANDARD" || value.redactionMode === "DIAGNOSTIC"
        ? value.redactionMode
        : "STRICT",
    includeScreenshot: booleanOrDefault(value.includeScreenshot, DEFAULT_PREFERENCES.includeScreenshot),
    includeHiddenElements: booleanOrDefault(
      value.includeHiddenElements,
      DEFAULT_PREFERENCES.includeHiddenElements,
    ),
    includePath: booleanOrDefault(value.includePath, DEFAULT_PREFERENCES.includePath),
    includePageTitle: booleanOrDefault(value.includePageTitle, DEFAULT_PREFERENCES.includePageTitle),
    includeColors: booleanOrDefault(value.includeColors, DEFAULT_PREFERENCES.includeColors),
    includeTextPreview: booleanOrDefault(
      value.includeTextPreview,
      DEFAULT_PREFERENCES.includeTextPreview,
    ),
    includeTextShape: booleanOrDefault(value.includeTextShape, DEFAULT_PREFERENCES.includeTextShape),
    includeInteractionFacts: booleanOrDefault(
      value.includeInteractionFacts,
      DEFAULT_PREFERENCES.includeInteractionFacts,
    ),
    includeRelationshipGraph: booleanOrDefault(
      value.includeRelationshipGraph,
      DEFAULT_PREFERENCES.includeRelationshipGraph,
    ),
    prepareFullDocumentImages: booleanOrDefault(
      value.prepareFullDocumentImages,
      DEFAULT_PREFERENCES.prepareFullDocumentImages,
    ),
    readinessHardTimeoutMs:
      validInteger(value.readinessHardTimeoutMs, 60_000) ?? DEFAULT_PREFERENCES.readinessHardTimeoutMs,
    maxTextPreviewChars: validInteger(value.maxTextPreviewChars, 500) ?? 160,
    maxElements,
    maxDepth,
    maxSnapshotBytes: validInteger(value.maxSnapshotBytes, 32_000_000) ?? 12_000_000,
  };
  return isPreferences(migrated) ? migrated : null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function validCaptureIntent(value: unknown): CaptureIntent | null {
  return [
    "GENERAL_AUDIT",
    "RESPONSIVE_COMPARISON",
    "TYPOGRAPHY_AUDIT",
    "INTERACTION_AUDIT",
    "OVERFLOW_INVESTIGATION",
  ].includes(String(value))
    ? (value as CaptureIntent)
    : null;
}

function validInteger(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : null;
}
