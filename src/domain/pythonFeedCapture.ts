import { canonicalJson } from "./canonical";
import {
  CANONICAL_SCROLL_TOLERANCE_CSS_PX,
  MINIMUM_PYTHON_FEED_POLICY_ID,
  MINIMUM_PYTHON_FEED_POLICY_VERSION,
} from "./capturePolicy";
import type {
  BindingContext,
  CaptureSession,
  PageProbeEvidence,
  PythonFeedCaptureGuard,
  RequestedViewportProfile,
  RuntimeSnapshot,
} from "./model";

const REQUIRED_PROFILES: readonly RequestedViewportProfile[] = ["DESKTOP", "TABLET", "MOBILE"];

export function evaluateGuidedPythonFeedCapture(input: {
  readonly session: CaptureSession;
  readonly snapshots: readonly RuntimeSnapshot[];
  readonly bindingContext: BindingContext | null;
  readonly probe: PageProbeEvidence;
  readonly requestedProfileId: RequestedViewportProfile;
}): PythonFeedCaptureGuard {
  const blockingCodes: string[] = [];
  const sessionReference = input.session.data.source_context_reference;

  if (!input.bindingContext || !sessionReference) {
    blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED");
  } else if (
    !input.bindingContext.selected_document ||
    input.bindingContext.reference.confirmation_state !== "CONFIRMED" ||
    canonicalJson(input.bindingContext.reference) !== canonicalJson(sessionReference)
  ) {
    blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE");
  }

  if (!REQUIRED_PROFILES.includes(input.requestedProfileId))
    blockingCodes.push("EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING");

  const existingWidths = [
    ...new Set(input.snapshots.map((snapshot) => snapshot.viewport.inner_width)),
  ].sort((left, right) => left - right);
  const existingProfiles = [
    ...new Set(input.snapshots.map((snapshot) => snapshot.viewport.requested_profile_id)),
  ].sort() as RequestedViewportProfile[];

  if (existingProfiles.includes(input.requestedProfileId))
    blockingCodes.push("EDIS_RUNTIME_REQUIRED_PROFILE_ALREADY_CAPTURED");
  if (existingWidths.includes(input.probe.inner_width))
    blockingCodes.push("EDIS_RUNTIME_DUPLICATE_MEASURED_VIEWPORT");
  if (
    input.snapshots.length > 0 &&
    input.snapshots.some(
      (snapshot) => snapshot.page.page_fingerprint !== input.probe.page_fingerprint,
    )
  )
    blockingCodes.push("EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH");
  if (
    sessionReference &&
    input.snapshots.some(
      (snapshot) =>
        snapshot.source_context_reference === null ||
        canonicalJson(snapshot.source_context_reference) !== canonicalJson(sessionReference),
    )
  )
    blockingCodes.push("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE");

  if (
    Math.abs(input.probe.scroll_x) > CANONICAL_SCROLL_TOLERANCE_CSS_PX ||
    Math.abs(input.probe.scroll_y) > CANONICAL_SCROLL_TOLERANCE_CSS_PX
  )
    blockingCodes.push("EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL");
  if (input.probe.document_visibility_state !== "visible")
    blockingCodes.push("EDIS_RUNTIME_PAGE_NOT_VISIBLE");
  if (input.probe.document_prerendering) blockingCodes.push("EDIS_RUNTIME_PAGE_PRERENDERING");
  if (input.probe.admin_bar.detection_state !== "ABSENT")
    blockingCodes.push("EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS");
  if (input.probe.elementor_editor_preview_present)
    blockingCodes.push("EDIS_RUNTIME_ELEMENTOR_EDITOR_PREVIEW_NOT_CANONICAL");
  if (input.probe.iframe_capture) blockingCodes.push("EDIS_RUNTIME_IFRAME_CAPTURE_NOT_CANONICAL");

  const imageReadiness = input.probe.viewport_image_readiness;
  if (
    imageReadiness.broken_count +
      imageReadiness.pending_count +
      imageReadiness.decode_failed_count +
      imageReadiness.timed_out_count >
    0
  )
    blockingCodes.push("EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY");

  const uniqueCodes = [...new Set(blockingCodes)];
  return {
    allowed: uniqueCodes.length === 0,
    policy_id: MINIMUM_PYTHON_FEED_POLICY_ID,
    policy_version: MINIMUM_PYTHON_FEED_POLICY_VERSION,
    measured_viewport: {
      width: input.probe.inner_width,
      height: input.probe.inner_height,
    },
    page_fingerprint: input.probe.page_fingerprint,
    existing_viewport_widths: existingWidths,
    existing_requested_profiles: existingProfiles,
    blocking_codes: uniqueCodes,
  };
}
