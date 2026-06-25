import type {
  CaptureSession,
  PackageValidationData,
  RequestedViewportProfile,
  RuntimeSnapshot,
  ScreenshotRecord,
} from "../domain/model";
import {
  evaluatePythonFeedReadiness,
  type ExportPurpose,
  type PythonFeedReadinessState,
} from "../domain/pythonFeed";
import { clearSelectedSessionIfMatches } from "./sessionUseCases";
import { isExportPurposeAllowed, isRuntimeEvidenceFallbackAvailable } from "../domain/exportPolicy";
import { downloadBytes } from "../infrastructure/download";
import { buildEvidencePackageOffMainThread } from "../infrastructure/exportWorkerClient";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import { loadPreferences } from "../infrastructure/storage/preferences";
import { loadSourceContextRecord } from "../infrastructure/storage/sourceContext";
import { MAX_SESSION_EVIDENCE_BYTES } from "../domain/resourceLimits";

export interface ExportPreflightReport {
  readonly observations: number;
  readonly runtimeNodes: number;
  readonly sourceContextImported: boolean;
  readonly screenshots: number;
  readonly distinctViewports: number;
  readonly hiddenElementsExcluded: boolean;
  readonly colorsExcluded: boolean;
  readonly textPreviewExcluded: boolean;
  readonly incompleteImagesTotal: number;
  readonly blockingErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly purpose: ExportPurpose;
  readonly pythonFeedReadiness: PythonFeedReadinessState;
  readonly distinctViewportWidths: number;
  readonly requestedProfilesPresent: readonly RequestedViewportProfile[];
  readonly missingRequiredProfiles: readonly RequestedViewportProfile[];
  readonly pageFingerprintConsistent: boolean;
  readonly runtimeEvidenceFallbackAvailable: boolean;
  readonly evidenceBytes: number;
  readonly evidenceByteLimit: number;
}

export async function getExportPreflight(
  sessionId: string,
  purpose: ExportPurpose = "RUNTIME_EVIDENCE",
): Promise<ExportPreflightReport> {
  const evidence = await loadSessionEvidence(sessionId);
  const sourceContextRecord = await loadSourceContextRecord();
  const pythonFeed = await evaluatePythonFeedReadiness({
    session: evidence.session,
    snapshots: evidence.snapshots,
    sourceContext: sourceContextRecord?.context ?? null,
  });
  const distinctViewports = new Set(
    evidence.snapshots.map(
      (snapshot) => `${snapshot.viewport.inner_width}x${snapshot.viewport.inner_height}`,
    ),
  ).size;
  const distinctViewportWidths = new Set(
    evidence.snapshots.map((snapshot) => snapshot.viewport.inner_width),
  ).size;
  const runtimeBlockingErrors: string[] = [];
  if (evidence.snapshots.length === 0) runtimeBlockingErrors.push("NO_RUNTIME_OBSERVATIONS");
  if (evidence.session.data.status === "CAPTURING")
    runtimeBlockingErrors.push("SESSION_CAPTURE_IN_PROGRESS");
  if (evidence.session.data.status === "FAILED") runtimeBlockingErrors.push("SESSION_FAILED");
  if (!isExportPurposeAllowed(evidence.session.data.workflow_mode, purpose))
    runtimeBlockingErrors.push("EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH");
  if (evidence.usage.totalBytes > MAX_SESSION_EVIDENCE_BYTES)
    runtimeBlockingErrors.push("EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED");
  const blockingErrors = [...runtimeBlockingErrors];
  if (purpose === "MINIMUM_PYTHON_FEED") blockingErrors.push(...pythonFeed.blocking_codes);
  const warnings: string[] = [];
  if (!evidence.session.data.source_context_reference) warnings.push("SOURCE_CONTEXT_NOT_IMPORTED");
  if (distinctViewports < 2) warnings.push("SINGLE_VIEWPORT_ONLY");
  if (evidence.screenshots.length === 0) warnings.push("SCREENSHOT_NOT_REQUESTED");
  if (
    evidence.snapshots.every((snapshot) => !snapshot.capture_configuration.include_hidden_elements)
  )
    warnings.push("HIDDEN_ELEMENTS_EXCLUDED");
  const incompleteImagesTotal = evidence.snapshots.reduce(
    (total, snapshot) => total + snapshot.capture_readiness.incomplete_image_count_total,
    0,
  );
  if (incompleteImagesTotal > 0) warnings.push("INCOMPLETE_IMAGES_OBSERVED");
  return {
    observations: evidence.snapshots.length,
    runtimeNodes: evidence.snapshots.reduce(
      (total, snapshot) => total + snapshot.elements.length,
      0,
    ),
    sourceContextImported: evidence.session.data.source_context_reference !== null,
    screenshots: evidence.screenshots.length,
    distinctViewports,
    hiddenElementsExcluded: evidence.snapshots.every(
      (snapshot) => !snapshot.capture_configuration.include_hidden_elements,
    ),
    colorsExcluded: evidence.snapshots.every(
      (snapshot) => !snapshot.capture_configuration.include_colors,
    ),
    textPreviewExcluded: evidence.snapshots.every(
      (snapshot) => !snapshot.capture_configuration.include_text_preview,
    ),
    incompleteImagesTotal,
    blockingErrors,
    warnings,
    purpose,
    pythonFeedReadiness: pythonFeed.state,
    distinctViewportWidths,
    requestedProfilesPresent: pythonFeed.requested_profiles_present,
    missingRequiredProfiles: pythonFeed.missing_required_profiles,
    pageFingerprintConsistent: pythonFeed.page_fingerprint_consistent,
    runtimeEvidenceFallbackAvailable: isRuntimeEvidenceFallbackAvailable({
      workflowMode: evidence.session.data.workflow_mode,
      requestedPurpose: purpose,
      runtimeBlockingErrors,
    }),
    evidenceBytes: evidence.usage.totalBytes,
    evidenceByteLimit: MAX_SESSION_EVIDENCE_BYTES,
  };
}

export async function exportSession(
  sessionId: string,
  purpose: ExportPurpose = "RUNTIME_EVIDENCE",
): Promise<{
  filename: string;
  entryCount: number;
  validation: PackageValidationData;
}> {
  const repository = new EvidenceRepository();
  const { session, snapshots, screenshots, usage } = await loadSessionEvidence(
    sessionId,
    repository,
  );
  if (usage.totalBytes > MAX_SESSION_EVIDENCE_BYTES)
    throw new Error("EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED");
  if (!isExportPurposeAllowed(session.data.workflow_mode, purpose))
    throw new Error("EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH");
  const sourceContextRecord = await loadSourceContextRecord();
  const built = await buildEvidencePackageOffMainThread({
    session,
    snapshots,
    screenshots,
    purpose,
    sourceContext:
      purpose === "MINIMUM_PYTHON_FEED" ? (sourceContextRecord?.context ?? null) : null,
  });
  downloadBytes(built.bytes, built.filename, "application/zip");
  const preferences = await loadPreferences();
  if (!preferences.retainAfterExport) {
    await repository.deleteSessionArtifacts(sessionId);
    await clearSelectedSessionIfMatches(sessionId);
  }
  return { filename: built.filename, entryCount: built.entryCount, validation: built.validation };
}

async function loadSessionEvidence(
  sessionId: string,
  repository = new EvidenceRepository(),
): Promise<{
  session: CaptureSession;
  snapshots: readonly RuntimeSnapshot[];
  screenshots: readonly ScreenshotRecord[];
  usage: Awaited<ReturnType<EvidenceRepository["getSessionResourceUsage"]>>;
}> {
  const session = await repository.getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const [snapshots, screenshots] = await Promise.all([
    repository.listSnapshotsBySession(sessionId),
    repository.listScreenshotsBySession(sessionId),
  ]);
  const usage = await repository.getSessionResourceUsage(sessionId, {
    snapshots,
    screenshots,
  });
  return { session, snapshots, screenshots, usage };
}
