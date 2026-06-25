import { MESSAGE_TYPES, PROTOCOL_VERSION, type BaseMessage, type MessageType } from "./messages";
import { isDiagnostic } from "./diagnostics";
import {
  DEFAULT_PREFERENCES,
  SCHEMA_VERSION,
  isRequestedViewportProfile,
  type CaptureConfiguration,
  type CaptureJob,
  type CaptureSession,
  type ElementMeasurement,
  type CollectorPreferences,
  type RuntimeSnapshot,
  type ScreenshotRecord,
} from "./model";
import { isAllowedStyleProperty } from "./styleAllowlist";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_NAME = /^[^\u0000-\u001F\u007F]{1,120}$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
export function isBaseMessage(value: unknown): value is BaseMessage {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["protocolVersion", "type", "requestId", "payload"]) &&
    value.protocolVersion === PROTOCOL_VERSION &&
    typeof value.type === "string" &&
    (MESSAGE_TYPES as readonly string[]).includes(value.type) &&
    isRequestId(value.requestId)
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
    value.schemaVersion === 4 &&
    ["STANDARD", "DEEP_DOM", "CUSTOM"].includes(String(value.captureProfile)) &&
    [
      "GENERAL_AUDIT",
      "RESPONSIVE_COMPARISON",
      "TYPOGRAPHY_AUDIT",
      "INTERACTION_AUDIT",
      "OVERFLOW_INVESTIGATION",
    ].includes(String(value.captureIntent)) &&
    ["STRICT", "STANDARD", "DIAGNOSTIC"].includes(String(value.redactionMode)) &&
    [
      "includeScreenshot",
      "includeHiddenElements",
      "includePath",
      "includePageTitle",
      "includeColors",
      "includeTextPreview",
      "includeTextShape",
      "includeInteractionFacts",
      "includeRelationshipGraph",
      "prepareFullDocumentImages",
      "retainAfterExport",
    ].every((key) => typeof value[key] === "boolean") &&
    isPositiveInteger(value.readinessHardTimeoutMs, 5_000) &&
    isPositiveInteger(value.maxTextPreviewChars, 500) &&
    isPositiveInteger(value.maxElements, 1_000) &&
    isPositiveInteger(value.maxDepth, 64) &&
    isPositiveInteger(value.maxSnapshotBytes, 32_000_000)
  );
}

export function validatePayload(type: MessageType, payload: unknown): boolean {
  switch (type) {
    case "PAGE_CHECK":
    case "PAGE_PROBE":
    case "STATE_GET":
    case "OPEN_SIDE_PANEL":
    case "OPTIONS_GET":
    case "CLEAR_ALL_DATA":
    case "SOURCE_CONTEXT_GET":
    case "SOURCE_CONTEXT_CLEAR":
      return payload === undefined;
    case "SESSION_CREATE":
      return isRecord(payload) && hasOnlyKeys(payload, ["name"]) && isSafeName(payload.name);
    case "SESSION_SELECT":
    case "EXPORT_COMPLETE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, [type === "SESSION_SELECT" ? "sessionId" : "sessionId"]) &&
        isUuid(payload.sessionId)
      );
    case "PYTHON_FEED_CAPTURE_CHECK":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["sessionId", "requestedProfileId"]) &&
        isUuid(payload.sessionId) &&
        isRequestedViewportProfile(payload.requestedProfileId)
      );
    case "CAPTURE_CANCEL":
    case "CAPTURE_STATUS":
    case "CONTENT_JOB_STATUS":
      return isRecord(payload) && hasOnlyKeys(payload, ["jobId"]) && isUuid(payload.jobId);
    case "CAPTURE_START":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, [
          "sessionId",
          "userLabel",
          "evidenceLabel",
          "requestedProfileId",
          "workflowMode",
          "captureIntent",
          "overrides",
        ]) &&
        isUuid(payload.sessionId) &&
        isSafeName(payload.userLabel) &&
        ["SIMULATED_VIEWPORT", "USER_LABELED_VIEWPORT"].includes(String(payload.evidenceLabel)) &&
        isRequestedViewportProfile(payload.requestedProfileId) &&
        ["RUNTIME_EVIDENCE", "MINIMUM_PYTHON_FEED"].includes(String(payload.workflowMode)) &&
        (payload.captureIntent === undefined ||
          [
            "GENERAL_AUDIT",
            "RESPONSIVE_COMPARISON",
            "TYPOGRAPHY_AUDIT",
            "INTERACTION_AUDIT",
            "OVERFLOW_INVESTIGATION",
          ].includes(typeof payload.captureIntent === "string" ? payload.captureIntent : "")) &&
        (payload.overrides === undefined || isPartialPreferences(payload.overrides))
      );
    case "OPTIONS_SAVE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["preferences"]) &&
        isPreferences(payload.preferences)
      );
    case "SOURCE_CONTEXT_IMPORT":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["text", "selectedDocumentId"]) &&
        typeof payload.text === "string" &&
        new TextEncoder().encode(payload.text).length <= 5_000_000 &&
        (payload.selectedDocumentId === null ||
          (typeof payload.selectedDocumentId === "string" &&
            payload.selectedDocumentId.length <= 160))
      );
    case "SOURCE_CONTEXT_SELECT_DOCUMENT":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["documentId"]) &&
        (payload.documentId === null ||
          (typeof payload.documentId === "string" && payload.documentId.length <= 160))
      );
    case "CONTENT_CONFIG_REQUEST":
      return isRecord(payload) && hasOnlyKeys(payload, ["tabUrl"]) && isHttpUrl(payload.tabUrl);
    case "CONTENT_CHUNK":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "index", "total", "data", "sha256", "byteLength"]) &&
        isUuid(payload.jobId) &&
        isNonNegativeInteger(payload.index, 10_000) &&
        isPositiveInteger(payload.total, 10_000) &&
        payload.index < payload.total &&
        typeof payload.data === "string" &&
        payload.data.length <= 500_000 &&
        typeof payload.sha256 === "string" &&
        SHA256_HEX.test(payload.sha256) &&
        isNonNegativeInteger(payload.byteLength, 1_000_000)
      );
    case "CONTENT_COMPLETE":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "total", "snapshotSha256", "byteLength"]) &&
        isUuid(payload.jobId) &&
        isPositiveInteger(payload.total, 10_000) &&
        typeof payload.snapshotSha256 === "string" &&
        SHA256_HEX.test(payload.snapshotSha256) &&
        isPositiveInteger(payload.byteLength, 32_000_000)
      );
    case "CONTENT_FAILED":
      return (
        isRecord(payload) &&
        hasOnlyKeys(payload, ["jobId", "code"]) &&
        isUuid(payload.jobId) &&
        typeof payload.code === "string" &&
        payload.code.length <= 100
      );
  }
}

export function isCaptureSession(value: unknown): value is CaptureSession {
  if (
    !isRecord(value) ||
    !isEnvelope(value, "urn:edis:schema:browser:capture-session", "1.1.0", "capture_session")
  )
    return false;
  const data = value.data;
  if (!isRecord(data)) return false;
  return (
    isUuid(data.session_id) &&
    isUuid(data.observation_set_id) &&
    isSafeName(data.name) &&
    isRfc3339(data.created_at) &&
    typeof data.extension_version === "string" &&
    SEMVER.test(data.extension_version) &&
    typeof data.browser_family === "string" &&
    (data.browser_version === null || typeof data.browser_version === "string") &&
    (data.runtime_environment === null || isRuntimeEnvironment(data.runtime_environment)) &&
    (data.source_context_reference === null ||
      isSourceContextReference(data.source_context_reference)) &&
    ["EXACT", "PROBABLE", "AMBIGUOUS", "UNMATCHED"].includes(String(data.source_binding_state)) &&
    (data.workflow_mode === null ||
      (typeof data.workflow_mode === "string" &&
        ["RUNTIME_EVIDENCE", "MINIMUM_PYTHON_FEED"].includes(data.workflow_mode))) &&
    Array.isArray(data.captures) &&
    data.captures.length <= 1_000 &&
    data.captures.every(isCaptureSummary) &&
    ["CREATED", "CAPTURING", "COMPLETE", "PARTIAL", "FAILED", "CANCELLED"].includes(
      String(data.status),
    ) &&
    allNumbersFinite(value)
  );
}

export function isCaptureJob(value: unknown): value is CaptureJob {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "requestId",
      "sessionId",
      "snapshotId",
      "tabId",
      "windowId",
      "documentUrl",
      "documentId",
      "createdAt",
      "updatedAt",
      "status",
      "expectedChunks",
      "receivedChunks",
      "config",
      "diagnostics",
    ])
  )
    return false;
  return (
    isUuid(value.id) &&
    isUuid(value.requestId) &&
    isUuid(value.sessionId) &&
    isUuid(value.snapshotId) &&
    isNonNegativeInteger(value.tabId, Number.MAX_SAFE_INTEGER) &&
    isNonNegativeInteger(value.windowId, Number.MAX_SAFE_INTEGER) &&
    isHttpUrl(value.documentUrl) &&
    (value.documentId === null ||
      (typeof value.documentId === "string" && value.documentId.length <= 200)) &&
    isRfc3339(value.createdAt) &&
    isRfc3339(value.updatedAt) &&
    [
      "PREPARED",
      "INJECTED",
      "RECEIVING",
      "ASSEMBLING",
      "COMPLETE",
      "FAILED",
      "CANCELLED",
      "NAVIGATED",
      "INTERRUPTED",
    ].includes(String(value.status)) &&
    (value.expectedChunks === null || isPositiveInteger(value.expectedChunks, 10_000)) &&
    isNonNegativeInteger(value.receivedChunks, 10_000) &&
    isCaptureConfiguration(value.config) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isDiagnostic)
  );
}

export function isScreenshotRecord(value: unknown): value is ScreenshotRecord {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "snapshotId",
      "sessionId",
      "mimeType",
      "bytes",
      "checksumSha256",
      "createdAt",
    ]) &&
    isUuid(value.snapshotId) &&
    isUuid(value.sessionId) &&
    value.mimeType === "image/png" &&
    value.bytes instanceof ArrayBuffer &&
    value.bytes.byteLength <= 16_000_000 &&
    typeof value.checksumSha256 === "string" &&
    SHA256_HEX.test(value.checksumSha256) &&
    isRfc3339(value.createdAt)
  );
}

export function isRuntimeSnapshot(value: unknown): value is RuntimeSnapshot {
  if (!isRecord(value)) return false;
  const required = [
    "schema_version",
    "artifact_type",
    "status",
    "source",
    "captured_at",
    "snapshot_id",
    "session_id",
    "observation_index",
    "capture_intent",
    "capture_configuration",
    "evidence_source",
    "runtime_environment",
    "source_context_reference",
    "page",
    "viewport",
    "document_metrics",
    "capture_readiness",
    "capture_state",
    "capture_environment",
    "capture_completeness",
    "runtime_structure_sha256",
    "runtime_regions",
    "page_structure_summary",
    "document_instances",
    "source_runtime_cardinality",
    "elements",
    "privacy",
    "diagnostics",
  ];
  if (
    !hasOnlyKeys(value, required) ||
    value.schema_version !== SCHEMA_VERSION ||
    value.artifact_type !== "runtime_snapshot" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE", "FAILED"].includes(String(value.status)) ||
    !isRfc3339(value.captured_at) ||
    !isUuid(value.snapshot_id) ||
    !isUuid(value.session_id) ||
    !isNonNegativeInteger(value.observation_index, 10_000) ||
    ![
      "GENERAL_AUDIT",
      "RESPONSIVE_COMPARISON",
      "TYPOGRAPHY_AUDIT",
      "INTERACTION_AUDIT",
      "OVERFLOW_INVESTIGATION",
    ].includes(String(value.capture_intent)) ||
    value.evidence_source !== "PUBLISHED_FRONTEND" ||
    !isRuntimeEnvironment(value.runtime_environment) ||
    !(
      value.source_context_reference === null ||
      isSourceContextReference(value.source_context_reference)
    ) ||
    !isRecord(value.source) ||
    value.source.collector_id !== "browser.runtime" ||
    typeof value.source.collector_version !== "string" ||
    !SEMVER.test(value.source.collector_version) ||
    !SHA256_DIGEST.test(String(value.runtime_structure_sha256)) ||
    !Array.isArray(value.runtime_regions) ||
    value.runtime_regions.length > 1_000 ||
    !isRecord(value.page_structure_summary) ||
    !Array.isArray(value.document_instances) ||
    value.document_instances.length > 10_000 ||
    !isRecord(value.source_runtime_cardinality) ||
    !isRecord(value.capture_state) ||
    !isRecord(value.capture_environment) ||
    !isRecord(value.viewport) ||
    !["DESKTOP", "TABLET", "MOBILE", "CUSTOM"].includes(
      String(value.viewport.requested_profile_id),
    ) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic) ||
    !Array.isArray(value.elements) ||
    value.elements.length > 1_000
  )
    return false;
  const nodeIds = new Set<string>();
  const refs: string[] = [];
  for (const [index, element] of value.elements.entries()) {
    if (
      !isElementMeasurement(
        element,
        Boolean(isRecord(value.privacy) && value.privacy.color_styles_included),
      )
    )
      return false;
    if (element.document_order !== index || nodeIds.has(element.node_id)) return false;
    nodeIds.add(element.node_id);
    if (element.identity.unique_in_document) refs.push(element.identity.stable_dom_reference);
  }
  if (new Set(refs).size !== refs.length) return false;
  if (
    !isRecord(value.capture_completeness) ||
    value.capture_completeness.elements_emitted !== value.elements.length
  )
    return false;
  return allNumbersFinite(value);
}

function isCaptureConfiguration(value: unknown): value is CaptureConfiguration {
  if (!isRecord(value)) return false;
  const prefs: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) prefs[key] = value[key];
  return (
    isPreferences(prefs) &&
    isUuid(value.sessionId) &&
    isUuid(value.snapshotId) &&
    isNonNegativeInteger(value.observationIndex, 10_000) &&
    isSafeName(value.userLabel) &&
    ["SIMULATED_VIEWPORT", "USER_LABELED_VIEWPORT"].includes(String(value.evidenceLabel)) &&
    isRequestedViewportProfile(value.requestedProfileId) &&
    ["RUNTIME_EVIDENCE", "MINIMUM_PYTHON_FEED"].includes(String(value.workflowMode)) &&
    (value.expectedPageFingerprint === null ||
      (typeof value.expectedPageFingerprint === "string" &&
        SHA256_DIGEST.test(value.expectedPageFingerprint))) &&
    (value.expectedViewportWidth === null || isFiniteNumber(value.expectedViewportWidth)) &&
    isRfc3339(value.capturedAt) &&
    (value.bindingContext === null || isRecord(value.bindingContext))
  );
}
function isCaptureSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    isUuid(value.snapshot_id) &&
    isSafeName(value.label) &&
    isRfc3339(value.captured_at) &&
    isFiniteNumber(value.actual_width) &&
    isFiniteNumber(value.actual_height) &&
    isNonNegativeInteger(value.element_count, 1_000) &&
    isNonNegativeInteger(value.overflow_count, 1_000) &&
    isNonNegativeInteger(value.diagnostic_count, 100_000) &&
    typeof value.screenshot_available === "boolean" &&
    ["COMPLETE", "PARTIAL"].includes(String(value.completeness_status)) &&
    Array.isArray(value.partial_reasons) &&
    value.partial_reasons.every((x) => typeof x === "string") &&
    isNonNegativeInteger(value.truncated_branch_count, 20_000) &&
    isNonNegativeInteger(value.identity_collision_count, 1_000) &&
    isNonNegativeInteger(value.skipped_hidden_subtree_count, 20_000) &&
    isNonNegativeInteger(value.capture_environment_warning_count, 100) &&
    ["CREATED", "CAPTURING", "COMPLETE", "PARTIAL", "FAILED", "CANCELLED"].includes(
      String(value.status),
    )
  );
}
function isElementMeasurement(value: unknown, includeColors: boolean): value is ElementMeasurement {
  if (
    !isRecord(value) ||
    !/^node-\d{6}$/.test(String(value.node_id)) ||
    !isNonNegativeInteger(value.document_order, 1_000) ||
    !isRecord(value.evidence_lineage) ||
    !SHA256_DIGEST.test(String(value.evidence_lineage.page_context_id)) ||
    !isRecord(value.identity) ||
    !SHA256_DIGEST.test(String(value.identity.reference_sha256)) ||
    !isRecord(value.runtime_elementor_markers) ||
    !isRecord(value.source_binding) ||
    !isRecord(value.relationships) ||
    !isRecord(value.bounding_rect) ||
    !isRecord(value.document_coordinates) ||
    !isRecord(value.viewport_intersection) ||
    !isFiniteNumber(value.area) ||
    !isRecord(value.computed_styles) ||
    !Object.entries(value.computed_styles).every(
      ([key, item]) =>
        isAllowedStyleProperty(key, includeColors) &&
        typeof item === "string" &&
        item.length <= 500,
    ) ||
    !isRecord(value.visibility) ||
    !isRecord(value.overflow) ||
    !isRecord(value.interaction_facts) ||
    !isRecord(value.text_shape) ||
    !isRecord(value.runtime_instance) ||
    !isRecord(value.computed_style_origin) ||
    !isUuid(value.evidence_lineage.snapshot_id)
  )
    return false;
  return allNumbersFinite(value);
}
function isRuntimeEnvironment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.browser_family === "string" &&
    (value.browser_version === null || typeof value.browser_version === "string") &&
    ["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"].includes(String(value.platform_category))
  );
}
function isSourceContextReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.analysis_set_id === null || isUuid(value.analysis_set_id)) &&
    isUuid(value.wordpress_bundle_id) &&
    [
      value.imported_source_context_sha256,
      value.source_export_root_sha256,
      value.site_fingerprint,
    ].every((item) => typeof item === "string" && SHA256_DIGEST.test(item)) &&
    (value.selected_document_id === null || typeof value.selected_document_id === "string") &&
    (value.selected_document_fingerprint === null ||
      (typeof value.selected_document_fingerprint === "string" &&
        SHA256_DIGEST.test(value.selected_document_fingerprint))) &&
    ["NOT_CONFIRMED", "CONFIRMED"].includes(String(value.confirmation_state))
  );
}
function isEnvelope(
  value: Record<string, unknown>,
  schemaId: string,
  version: string,
  type: string,
): boolean {
  return (
    hasOnlyKeys(value, [
      "schema_id",
      "schema_version",
      "artifact_type",
      "producer",
      "captured_at",
      "canonicalization",
      "data",
      "diagnostics",
    ]) &&
    value.schema_id === schemaId &&
    value.schema_version === version &&
    value.artifact_type === type &&
    isRecord(value.producer) &&
    value.producer.product === "EDIS Browser Runtime Evidence Collector" &&
    typeof value.producer.version === "string" &&
    SEMVER.test(value.producer.version) &&
    isRfc3339(value.captured_at) &&
    isRecord(value.canonicalization) &&
    value.canonicalization.profile === "EDIS-CJ-1" &&
    value.canonicalization.hash_algorithm === "sha256" &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isDiagnostic)
  );
}
function isPartialPreferences(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) => Object.hasOwn(DEFAULT_PREFERENCES, key))
  )
    return false;
  return isPreferences({ ...DEFAULT_PREFERENCES, ...value });
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function isRfc3339(value: unknown): value is string {
  return typeof value === "string" && RFC3339.test(value) && Number.isFinite(Date.parse(value));
}
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function isNonNegativeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function allNumbersFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (isRecord(value)) return Object.values(value).every(allNumbersFinite);
  return true;
}
