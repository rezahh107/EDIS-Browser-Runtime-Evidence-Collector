import { canonicalJson } from "./canonical";
import type {
  CaptureSession,
  ImportedSourceContext,
  RequestedViewportProfile,
  RuntimeSnapshot,
} from "./model";
import { hasReadinessError } from "./readinessState";
import { sha256Digest } from "../infrastructure/checksum";

export type ExportPurpose = "RUNTIME_EVIDENCE" | "MINIMUM_PYTHON_FEED";
export type PythonFeedReadinessState = "READY" | "INSUFFICIENT_EVIDENCE" | "INVALID";

export interface PythonFeedReadiness {
  readonly state: PythonFeedReadinessState;
  readonly export_allowed: boolean;
  readonly source_context_present: boolean;
  readonly source_context_confirmed: boolean;
  readonly source_context_hash_matches: boolean;
  readonly observation_count: number;
  readonly distinct_viewport_width_count: number;
  readonly requested_profiles_present: readonly RequestedViewportProfile[];
  readonly missing_required_profiles: readonly RequestedViewportProfile[];
  readonly page_fingerprint_consistent: boolean;
  readonly source_context_reference_consistent: boolean;
  readonly canonical_scroll_state: boolean;
  readonly noncanonical_scroll_observations: readonly number[];
  readonly page_visibility_valid: boolean;
  readonly invalid_visibility_observations: readonly number[];
  readonly prerendering_absent: boolean;
  readonly prerendering_observations: readonly number[];
  readonly admin_bar_absent: boolean;
  readonly admin_bar_observations: readonly number[];
  readonly viewport_images_ready: boolean;
  readonly unresolved_viewport_image_observations: readonly number[];
  readonly canonical_environment_valid: boolean;
  readonly blocking_codes: readonly string[];
}

const REQUIRED_PROFILES: readonly RequestedViewportProfile[] = ["DESKTOP", "TABLET", "MOBILE"];

export async function evaluatePythonFeedReadiness(input: {
  readonly session: CaptureSession;
  readonly snapshots: readonly RuntimeSnapshot[];
  readonly sourceContext: ImportedSourceContext | null;
}): Promise<PythonFeedReadiness> {
  const blockingCodes: string[] = [];
  const sessionReference = input.session.data.source_context_reference;
  const sourceContextPresent = input.sourceContext !== null && sessionReference !== null;
  if (!sourceContextPresent) blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED");

  const sourceContextConfirmed =
    sessionReference?.confirmation_state === "CONFIRMED" &&
    sessionReference.selected_document_id !== null &&
    sessionReference.selected_document_fingerprint !== null;
  if (sourceContextPresent && !sourceContextConfirmed)
    blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE");

  let sourceContextHashMatches = false;
  if (sourceContextPresent && input.sourceContext && sessionReference) {
    const bytes = new TextEncoder().encode(canonicalJson(input.sourceContext));
    sourceContextHashMatches =
      (await sha256Digest(bytes)) === sessionReference.imported_source_context_sha256 &&
      input.sourceContext.data.source_export_root_sha256 ===
        sessionReference.source_export_root_sha256 &&
      input.sourceContext.data.site_fingerprint === sessionReference.site_fingerprint &&
      input.sourceContext.data.documents.some(
        (document) =>
          document.document_id === sessionReference.selected_document_id &&
          document.document_fingerprint === sessionReference.selected_document_fingerprint,
      );
    if (!sourceContextHashMatches) blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE");
  }

  const indexes = input.snapshots
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const invalidIndexes =
    new Set(indexes).size !== indexes.length || indexes.some((value, index) => value !== index);
  if (invalidIndexes) blockingCodes.push("EDIS_RUNTIME_OBSERVATION_INDEX_INVALID");

  if (input.snapshots.length < 3)
    blockingCodes.push("EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS");

  const distinctViewportWidths = new Set(
    input.snapshots.map((snapshot) => snapshot.viewport.inner_width),
  ).size;
  if (distinctViewportWidths < 3)
    blockingCodes.push("EDIS_RUNTIME_INSUFFICIENT_DISTINCT_VIEWPORTS");

  const requestedProfiles = [
    ...new Set(input.snapshots.map((snapshot) => snapshot.viewport.requested_profile_id)),
  ].sort() as RequestedViewportProfile[];
  const missingRequiredProfiles = REQUIRED_PROFILES.filter(
    (profile) => !requestedProfiles.includes(profile),
  );
  if (missingRequiredProfiles.length > 0)
    blockingCodes.push("EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING");

  const pageFingerprints = new Set(
    input.snapshots.map((snapshot) => snapshot.page.page_fingerprint),
  );
  const pageFingerprintConsistent = pageFingerprints.size <= 1;
  if (!pageFingerprintConsistent) blockingCodes.push("EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH");

  const sourceContextReferenceConsistent = input.snapshots.every((snapshot) => {
    const reference = snapshot.source_context_reference;
    if (!sessionReference || !reference) return sessionReference === reference;
    return canonicalJson(reference) === canonicalJson(sessionReference);
  });
  if (!sourceContextReferenceConsistent)
    blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_REFERENCE_MISMATCH");

  const noncanonicalScrollObservations = input.snapshots
    .filter(
      (snapshot) =>
        Math.abs(snapshot.capture_state.scroll_x) > 1 ||
        Math.abs(snapshot.capture_state.scroll_y) > 1,
    )
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const canonicalScrollState = noncanonicalScrollObservations.length === 0;
  if (!canonicalScrollState) blockingCodes.push("EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL");

  const invalidVisibilityObservations = input.snapshots
    .filter((snapshot) => snapshot.capture_state.document_visibility_state !== "visible")
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const pageVisibilityValid = invalidVisibilityObservations.length === 0;
  if (!pageVisibilityValid) blockingCodes.push("EDIS_RUNTIME_PAGE_NOT_VISIBLE");

  const prerenderingObservations = input.snapshots
    .filter((snapshot) => snapshot.capture_state.document_prerendering)
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const prerenderingAbsent = prerenderingObservations.length === 0;
  if (!prerenderingAbsent) blockingCodes.push("EDIS_RUNTIME_PAGE_PRERENDERING");

  const adminBarObservations = input.snapshots
    .filter((snapshot) => snapshot.capture_environment.admin_bar.detection_state !== "ABSENT")
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const adminBarAbsent = adminBarObservations.length === 0;
  if (!adminBarAbsent) blockingCodes.push("EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS");

  if (input.snapshots.some((snapshot) => hasReadinessError(snapshot.capture_readiness)))
    blockingCodes.push("EDIS_RUNTIME_READINESS_ERROR");

  const unresolvedViewportImageObservations = input.snapshots
    .filter((snapshot) => {
      const readiness = snapshot.capture_readiness.viewport_image_readiness;
      return (
        readiness.broken_count +
          readiness.pending_count +
          readiness.decode_failed_count +
          readiness.timed_out_count >
        0
      );
    })
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  const viewportImagesReady = unresolvedViewportImageObservations.length === 0;
  if (!viewportImagesReady) blockingCodes.push("EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY");

  const canonicalEnvironmentValid = input.snapshots.every(
    (snapshot) =>
      !snapshot.capture_environment.elementor_editor_preview_present &&
      !snapshot.capture_environment.iframe_capture,
  );
  if (!canonicalEnvironmentValid) {
    if (
      input.snapshots.some(
        (snapshot) => snapshot.capture_environment.elementor_editor_preview_present,
      )
    )
      blockingCodes.push("EDIS_RUNTIME_ELEMENTOR_EDITOR_PREVIEW_NOT_CANONICAL");
    if (input.snapshots.some((snapshot) => snapshot.capture_environment.iframe_capture))
      blockingCodes.push("EDIS_RUNTIME_IFRAME_CAPTURE_NOT_CANONICAL");
  }

  const uniqueCodes = [...new Set(blockingCodes)].sort();
  const invalid = uniqueCodes.some((code) =>
    [
      "EDIS_RUNTIME_OBSERVATION_INDEX_INVALID",
      "EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH",
      "EDIS_RUNTIME_SOURCE_CONTEXT_REFERENCE_MISMATCH",
      "EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE",
      "EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH",
    ].includes(code),
  );
  const state: PythonFeedReadinessState =
    uniqueCodes.length === 0 ? "READY" : invalid ? "INVALID" : "INSUFFICIENT_EVIDENCE";

  return {
    state,
    export_allowed: state === "READY",
    source_context_present: sourceContextPresent,
    source_context_confirmed: sourceContextConfirmed,
    source_context_hash_matches: sourceContextHashMatches,
    observation_count: input.snapshots.length,
    distinct_viewport_width_count: distinctViewportWidths,
    requested_profiles_present: requestedProfiles,
    missing_required_profiles: missingRequiredProfiles,
    page_fingerprint_consistent: pageFingerprintConsistent,
    source_context_reference_consistent: sourceContextReferenceConsistent,
    canonical_scroll_state: canonicalScrollState,
    noncanonical_scroll_observations: noncanonicalScrollObservations,
    page_visibility_valid: pageVisibilityValid,
    invalid_visibility_observations: invalidVisibilityObservations,
    prerendering_absent: prerenderingAbsent,
    prerendering_observations: prerenderingObservations,
    admin_bar_absent: adminBarAbsent,
    admin_bar_observations: adminBarObservations,
    viewport_images_ready: viewportImagesReady,
    unresolved_viewport_image_observations: unresolvedViewportImageObservations,
    canonical_environment_valid: canonicalEnvironmentValid,
    blocking_codes: uniqueCodes,
  };
}
