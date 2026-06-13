export const DIAGNOSTIC_CODES = [
  "EDIS_RUNTIME_UNSUPPORTED_PAGE",
  "EDIS_RUNTIME_PERMISSION_DENIED",
  "EDIS_RUNTIME_TAB_NAVIGATED",
  "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED",
  "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
  "EDIS_RUNTIME_SERIALIZATION_FAILED",
  "EDIS_RUNTIME_SCREENSHOT_FAILED",
  "EDIS_RUNTIME_PARTIAL_IDENTITY",
  "EDIS_RUNTIME_NON_FINITE_GEOMETRY",
  "EDIS_RUNTIME_WORKER_INTERRUPTED",
  "EDIS_RUNTIME_EXPORT_VALIDATION_FAILED",
  "EDIS_RUNTIME_CAPTURE_CANCELLED",
  "EDIS_RUNTIME_MESSAGE_REJECTED",
  "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT",
  "EDIS_RUNTIME_DEPTH_LIMIT_REACHED",
  "EDIS_RUNTIME_SCAN_LIMIT_REACHED",
  "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];
export type DiagnosticSeverity = "INFO" | "WARNING" | "ERROR" | "FATAL";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly recoverable: boolean;
  readonly context: Readonly<Record<string, string | number | boolean | null>>;
}

export function diagnostic(
  code: DiagnosticCode,
  severity: DiagnosticSeverity,
  message: string,
  recoverable: boolean,
  context: Readonly<Record<string, string | number | boolean | null>> = {},
): Diagnostic {
  return { code, severity, message, recoverable, context };
}

export function isDiagnostic(value: unknown): value is Diagnostic {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    (DIAGNOSTIC_CODES as readonly string[]).includes(value.code) &&
    ["INFO", "WARNING", "ERROR", "FATAL"].includes(String(value.severity)) &&
    typeof value.message === "string" &&
    typeof value.recoverable === "boolean" &&
    isRecord(value.context)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
