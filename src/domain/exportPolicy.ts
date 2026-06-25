import type { CaptureWorkflowMode } from "./model";
import type { ExportPurpose } from "./pythonFeed";

/**
 * Export compatibility is intentionally one-way.
 *
 * A minimum-feed capture session may be exported as ordinary runtime evidence
 * without changing any recorded facts. The reverse direction remains forbidden
 * because a runtime-evidence session did not opt into the stricter capture guard.
 */
export function isExportPurposeAllowed(
  workflowMode: CaptureWorkflowMode | null,
  purpose: ExportPurpose,
): boolean {
  if (workflowMode === null) return purpose === "RUNTIME_EVIDENCE";
  if (workflowMode === "MINIMUM_PYTHON_FEED") return true;
  return purpose === "RUNTIME_EVIDENCE";
}

export function isRuntimeEvidenceFallbackAvailable(input: {
  readonly workflowMode: CaptureWorkflowMode | null;
  readonly requestedPurpose: ExportPurpose;
  readonly runtimeBlockingErrors: readonly string[];
}): boolean {
  return (
    input.workflowMode === "MINIMUM_PYTHON_FEED" &&
    input.requestedPurpose === "MINIMUM_PYTHON_FEED" &&
    input.runtimeBlockingErrors.length === 0
  );
}
