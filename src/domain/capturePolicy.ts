export const MINIMUM_PYTHON_FEED_POLICY_ID = "edis.minimum-python-feed";
export const MINIMUM_PYTHON_FEED_POLICY_VERSION = 1;
export const VIEWPORT_IMAGE_READINESS_POLICY_ID = "edis.viewport-image-readiness";
export const VIEWPORT_IMAGE_READINESS_POLICY_VERSION = 1;
export const VIEWPORT_IMAGE_READINESS_TIMEOUT_MS = 1_500;
export const CANONICAL_SCROLL_TOLERANCE_CSS_PX = 1;

import type { CaptureWorkflowMode } from "./model";

/**
 * Legacy sessions created before workflow provenance was persisted are runtime-only
 * once they already contain captures. Empty sessions may still select a workflow
 * before their first capture.
 */
export function effectiveSessionWorkflowMode(
  workflowMode: CaptureWorkflowMode | null,
  captureCount: number,
): CaptureWorkflowMode | null {
  if (workflowMode !== null) return workflowMode;
  return captureCount > 0 ? "RUNTIME_EVIDENCE" : null;
}
