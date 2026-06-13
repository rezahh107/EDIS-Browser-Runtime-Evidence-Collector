import { MESSAGE_TYPES, PROTOCOL_VERSION, type BaseMessage, type MessageType } from "./messages";
import { DEFAULT_PREFERENCES, type CollectorPreferences, type RuntimeSnapshot } from "./model";
import { isDiagnostic } from "./diagnostics";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_NAME = /^[^\u0000-\u001F\u007F]{1,120}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBaseMessage(value: unknown): value is BaseMessage {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === PROTOCOL_VERSION &&
    typeof value.type === "string" &&
    (MESSAGE_TYPES as readonly string[]).includes(value.type) &&
    typeof value.requestId === "string" &&
    REQUEST_ID.test(value.requestId)
  );
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isSafeName(value: unknown): value is string {
  return typeof value === "string" && SAFE_NAME.test(value.trim());
}

export function isPositiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maximum;
}

export function isPreferences(value: unknown): value is CollectorPreferences {
  if (!isRecord(value) || !hasOnlyKeys(value, Object.keys(DEFAULT_PREFERENCES))) return false;
  return (
    value.schemaVersion === 1 &&
    ["STRICT", "STANDARD", "DIAGNOSTIC"].includes(String(value.redactionMode)) &&
    typeof value.includeTextPreview === "boolean" &&
    typeof value.includeScreenshot === "boolean" &&
    typeof value.includeHiddenElements === "boolean" &&
    typeof value.includeAccessibilityMetadata === "boolean" &&
    typeof value.includePath === "boolean" &&
    typeof value.includePageTitle === "boolean" &&
    typeof value.includeColors === "boolean" &&
    typeof value.retainAfterExport === "boolean" &&
    isPositiveInteger(value.maxElements, 2_000) &&
    isPositiveInteger(value.maxDepth, 64) &&
    isPositiveInteger(value.maxSnapshotBytes, 32_000_000) &&
    isPositiveInteger(value.maxTextPreviewLength, 500)
  );
}

export function validatePayload(type: MessageType, payload: unknown): boolean {
  switch (type) {
    case "PAGE_CHECK":
    case "STATE_GET":
    case "OPEN_SIDE_PANEL":
    case "OPTIONS_GET":
    case "CLEAR_ALL_DATA":
      return payload === undefined || payload === null;
    case "SESSION_CREATE":
      return isRecord(payload) && hasOnlyKeys(payload, ["name"]) && isSafeName(payload.name);
    case "SESSION_SELECT":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["sessionId"]) &&
        typeof payload.sessionId === "string" &&
        REQUEST_ID.test(payload.sessionId)
      );
    case "CAPTURE_START":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, [
          "sessionId",
          "userLabel",
          "evidenceLabel",
          "officialBreakpointId",
          "overrides",
        ]) &&
        typeof payload.sessionId === "string" &&
        REQUEST_ID.test(payload.sessionId) &&
        isSafeName(payload.userLabel) &&
        ["SIMULATED_VIEWPORT", "USER_LABELED_VIEWPORT", "OFFICIAL_MANIFEST_MATCH"].includes(
          String(payload.evidenceLabel),
        ) &&
        (payload.officialBreakpointId === null || isSafeName(payload.officialBreakpointId)) &&
        (payload.overrides === undefined || isPartialPreferences(payload.overrides))
      );
    case "CAPTURE_CANCEL":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId)
      );
    case "CAPTURE_STATUS":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId)
      );
    case "OPTIONS_SAVE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["preferences"]) &&
        isPreferences(payload.preferences)
      );
    case "EXPORT_COMPLETE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["sessionId"]) &&
        typeof payload.sessionId === "string" &&
        REQUEST_ID.test(payload.sessionId)
      );
    case "CONTENT_CONFIG_REQUEST":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["tabUrl"]) &&
        typeof payload.tabUrl === "string" &&
        payload.tabUrl.length <= 4_096
      );
    case "CONTENT_CHUNK":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "index", "total", "data"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId) &&
        isPositiveInteger(payload.total, 10_000) &&
        typeof payload.index === "number" &&
        Number.isInteger(payload.index) &&
        payload.index >= 0 &&
        payload.index < payload.total &&
        typeof payload.data === "string" &&
        payload.data.length <= 524_288
      );
    case "CONTENT_COMPLETE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "total"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId) &&
        isPositiveInteger(payload.total, 10_000)
      );
    case "CONTENT_FAILED":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "code"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId) &&
        typeof payload.code === "string" &&
        payload.code.length <= 100
      );
    case "CONTENT_JOB_STATUS":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId"]) &&
        typeof payload.jobId === "string" &&
        REQUEST_ID.test(payload.jobId)
      );
  }
}

export function isRuntimeSnapshot(value: unknown): value is RuntimeSnapshot {
  if (!isRecord(value)) return false;
  if (
    value.schema_version !== "1.0.0" ||
    value.artifact_type !== "runtime_snapshot" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE", "FAILED"].includes(String(value.status)) ||
    typeof value.captured_at !== "string" ||
    !isRecord(value.source) ||
    value.source.collector_id !== "browser.runtime" ||
    typeof value.source.collector_version !== "string" ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic) ||
    !isRecord(value.data)
  )
    return false;
  return (
    typeof value.data.snapshot_id === "string" &&
    typeof value.data.session_id === "string" &&
    value.data.evidence_source === "PUBLISHED_FRONTEND" &&
    isRecord(value.data.page) &&
    isRecord(value.data.viewport) &&
    isRecord(value.data.document_metrics) &&
    Array.isArray(value.data.elements) &&
    isRecord(value.data.privacy)
  );
}

function isPartialPreferences(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const merged = { ...DEFAULT_PREFERENCES, ...value };
  return isPreferences(merged);
}
