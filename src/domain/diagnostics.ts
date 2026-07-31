export const DIAGNOSTIC_CODES = [
  "EDIS_RUNTIME_UNSUPPORTED_PAGE",
  "EDIS_RUNTIME_PERMISSION_DENIED",
  "EDIS_RUNTIME_TAB_NAVIGATED",
  "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED",
  "EDIS_RUNTIME_STYLE_VALUE_LIMIT_REACHED",
  "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
  "EDIS_RUNTIME_SERIALIZATION_FAILED",
  "EDIS_RUNTIME_SCREENSHOT_FAILED",
  "EDIS_RUNTIME_PARTIAL_IDENTITY",
  "EDIS_RUNTIME_IDENTITY_COLLISION",
  "EDIS_RUNTIME_NON_FINITE_GEOMETRY",
  "EDIS_RUNTIME_WORKER_INTERRUPTED",
  "EDIS_RUNTIME_EXPORT_VALIDATION_FAILED",
  "EDIS_RUNTIME_CAPTURE_CANCELLED",
  "EDIS_RUNTIME_MESSAGE_REJECTED",
  "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT",
  "EDIS_RUNTIME_DEPTH_LIMIT_REACHED",
  "EDIS_RUNTIME_SCAN_LIMIT_REACHED",
  "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
  "EDIS_RUNTIME_SOURCE_CONTEXT_INVALID",
  "EDIS_RUNTIME_SOURCE_CONTEXT_LIMIT_REACHED",
  "EDIS_RUNTIME_SOURCE_CONTEXT_NOT_SELECTED",
  "EDIS_RUNTIME_SOURCE_BINDING_AMBIGUOUS",
  "EDIS_RUNTIME_SOURCE_BINDING_UNMATCHED",
  "EDIS_RUNTIME_RELATIONSHIP_LIMIT_REACHED",
  "EDIS_RUNTIME_TEXT_SHAPE_LIMIT_REACHED",
  "EDIS_RUNTIME_READINESS_TIMEOUT",
  "EDIS_RUNTIME_READINESS_UNSTABLE",
  "EDIS_RUNTIME_READINESS_ERROR",
  "EDIS_RUNTIME_LOCATOR_REDACTED",
  "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_TAB",
  "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_SESSION",
  "EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED",
  "EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE",
  "EDIS_RUNTIME_DUPLICATE_MEASURED_VIEWPORT",
  "EDIS_RUNTIME_REQUIRED_PROFILE_ALREADY_CAPTURED",
  "EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING",
  "EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH",
  "EDIS_RUNTIME_SCHEMA_ID_NOT_REGISTERED",
  "EDIS_RUNTIME_SOURCE_CONTEXT_NOT_IMPORTED",
  "EDIS_RUNTIME_SINGLE_VIEWPORT_ONLY",
  "EDIS_RUNTIME_SCREENSHOT_NOT_REQUESTED",
  "EDIS_RUNTIME_HIDDEN_ELEMENTS_EXCLUDED",
  "EDIS_RUNTIME_INCOMPLETE_IMAGES_OUTSIDE_VIEWPORT",
  "EDIS_RUNTIME_DOCUMENT_NOT_FOCUSED",
  "EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION",
  "EDIS_RUNTIME_DUPLICATE_OBSERVATION_INDEX",
  "EDIS_RUNTIME_NON_CONTIGUOUS_OBSERVATION_INDEX",
  "EDIS_RUNTIME_ORPHAN_SNAPSHOT",
  "EDIS_RUNTIME_MISSING_SNAPSHOT",
  "EDIS_RUNTIME_LAZY_LOAD_SWEEP_COMPLETED",
  "EDIS_RUNTIME_LAZY_LOAD_SWEEP_FAILED",
  "EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL",
  "EDIS_RUNTIME_PAGE_NOT_VISIBLE",
  "EDIS_RUNTIME_PAGE_PRERENDERING",
  "EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS",
  "EDIS_RUNTIME_ELEMENTOR_EDITOR_PREVIEW_NOT_CANONICAL",
  "EDIS_RUNTIME_IFRAME_CAPTURE_NOT_CANONICAL",
  "EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY",
  "EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH",
  "EDIS_RUNTIME_MALFORMED_RESPONSE",
  "EDIS_RUNTIME_STORAGE_READ_FAILED",
  "EDIS_RUNTIME_BROWSER_QUALIFICATION_FAILED",
  "EDIS_RUNTIME_RESTRICTED_PAGE_INJECTION_FAILED",
  "EDIS_RUNTIME_EXPORT_PROVENANCE",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
export const DIAGNOSTIC_FAILURE_BOUNDARIES = [
  "REQUEST_CONSTRUCTION_FAILURE",
  "TRANSPORT_FAILURE",
  "LISTENER_FAILURE",
  "CONTENT_CAPTURE_FAILURE",
  "CHUNK_VALIDATION_FAILURE",
  "STORAGE_WRITE_FAILURE",
  "MIGRATION_STORAGE_READ_FAILURE",
  "EXPORT_PREFLIGHT_FAILURE",
  "PACKAGE_GENERATION_FAILURE",
  "BROWSER_QUALIFICATION_FAILURE",
  "SERVICE_WORKER_RESTART_RECOVERY_FAILURE",
  "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
  "RESPONSE_ENVELOPE_VALIDATION_FAILURE",
] as const;
export type DiagnosticFailureBoundary = (typeof DIAGNOSTIC_FAILURE_BOUNDARIES)[number];
export type DiagnosticSeverity = "INFO" | "WARNING" | "ERROR";
export type DiagnosticScope = "SEMANTIC" | "OPERATIONAL";
export type DiagnosticContextValue = string | number | boolean | null | readonly string[];

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly scope: DiagnosticScope;
  readonly message_key: string;
  readonly failure_boundary?: DiagnosticFailureBoundary;
  readonly context: Readonly<Record<string, DiagnosticContextValue>>;
}

/**
 * The legacy message/recoverable arguments remain accepted so existing call sites stay readable.
 * Exported diagnostics contain only the frozen machine contract.
 */
export function diagnostic(
  code: DiagnosticCode,
  severity: DiagnosticSeverity | "FATAL",
  _legacyMessage: string,
  _recoverable: boolean,
  context: Readonly<Record<string, DiagnosticContextValue>> = {},
  scope: DiagnosticScope = "SEMANTIC",
  failureBoundary?: DiagnosticFailureBoundary,
): Diagnostic {
  return {
    code,
    severity: severity === "FATAL" ? "ERROR" : severity,
    scope,
    message_key: `diagnostic.${code.toLowerCase()}`,
    ...(failureBoundary === undefined ? {} : { failure_boundary: failureBoundary }),
    context: filterDiagnosticContext(context),
  };
}

export function diagnosticDisplayMessage(value: Diagnostic): string {
  return `${value.code}${Object.keys(value.context).length > 0 ? ` ${JSON.stringify(value.context)}` : ""}`;
}

export function isDiagnostic(value: unknown): value is Diagnostic {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    (DIAGNOSTIC_CODES as readonly string[]).includes(value.code) &&
    ["INFO", "WARNING", "ERROR"].includes(String(value.severity)) &&
    ["SEMANTIC", "OPERATIONAL"].includes(String(value.scope)) &&
    typeof value.message_key === "string" &&
    /^diagnostic\.[a-z0-9_.-]{1,160}$/.test(value.message_key) &&
    (value.failure_boundary === undefined ||
      (typeof value.failure_boundary === "string" &&
        (DIAGNOSTIC_FAILURE_BOUNDARIES as readonly string[]).includes(value.failure_boundary))) &&
    isRecord(value.context) &&
    Object.values(value.context).every(isContextValue)
  );
}

function filterDiagnosticContext(
  context: Readonly<Record<string, DiagnosticContextValue>>,
): Readonly<Record<string, DiagnosticContextValue>> {
  const output: Record<string, DiagnosticContextValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!isSafeDiagnosticContextKey(key)) continue;
    output[key] = typeof value === "string" ? redactSensitiveContextValue(key, value) : value;
  }
  return output;
}

function isSafeDiagnosticContextKey(value: string): boolean {
  if (!/^[a-z][a-z0-9_]{0,80}$/.test(value)) return false;
  return !/(cookie|token|credential|password|secret|localstorage|sessionstorage|form_value|dom_excerpt|page_text)/i.test(
    value,
  );
}

function redactSensitiveContextValue(key: string, value: string): string {
  if (/url/i.test(key)) {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      url.search = url.search ? "?redacted" : "";
      url.hash = "";
      return url.toString();
    } catch {
      return value.length <= 500 ? value : value.slice(0, 500);
    }
  }
  return value.length <= 500 ? value : value.slice(0, 500);
}

function isContextValue(value: unknown): boolean {
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string" && item.length <= 500)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
