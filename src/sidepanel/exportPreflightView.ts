import type { ExportPreflightReport } from "../application/exportUseCase";

export interface ExportPreflightViewState {
  readonly hasBlockers: boolean;
  readonly showWarnings: boolean;
  readonly confirmDisabled: boolean;
  readonly showRuntimeFallback: boolean;
  readonly blockingMessageKey:
    | "preflightBlockingWithRuntimeFallback"
    | "preflightBlockingNoFallback"
    | null;
}

export function makeExportPreflightViewState(
  report: Pick<
    ExportPreflightReport,
    "blockingErrors" | "warnings" | "runtimeEvidenceFallbackAvailable"
  >,
): ExportPreflightViewState {
  const hasBlockers = report.blockingErrors.length > 0;
  return {
    hasBlockers,
    showWarnings: report.warnings.length > 0,
    confirmDisabled: hasBlockers,
    showRuntimeFallback: hasBlockers && report.runtimeEvidenceFallbackAvailable,
    blockingMessageKey: hasBlockers
      ? report.runtimeEvidenceFallbackAvailable
        ? "preflightBlockingWithRuntimeFallback"
        : "preflightBlockingNoFallback"
      : null,
  };
}
