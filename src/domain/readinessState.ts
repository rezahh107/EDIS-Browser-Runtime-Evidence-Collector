import type { CaptureReadiness } from "./model";

export function hasReadinessError(readiness: Pick<CaptureReadiness, "process_state">): boolean {
  return readiness.process_state === "ERROR";
}
