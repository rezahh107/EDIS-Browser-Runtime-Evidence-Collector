import { describe, expect, it } from "vitest";
import type {
  BindingContext,
  CaptureSession,
  PageProbeEvidence,
  RuntimeSnapshot,
  SourceContextReference,
} from "../../src/domain/model";
import { evaluateGuidedPythonFeedCapture } from "../../src/domain/pythonFeedCapture";
import { hashA, hashB, makeSession, makeSnapshot } from "../helpers/fixtures";

const reference: SourceContextReference = {
  analysis_set_id: "723e4567-e89b-42d3-a456-426614174000",
  wordpress_bundle_id: "823e4567-e89b-42d3-a456-426614174000",
  imported_source_context_sha256: hashA,
  source_export_root_sha256: hashA,
  site_fingerprint: hashB,
  selected_document_id: "42",
  selected_document_fingerprint: hashB,
  confirmation_state: "CONFIRMED",
};

const document = {
  document_id: "42",
  document_type: "page",
  document_fingerprint: hashB,
  saved_source_sha256: hashA,
  page_locator_candidates: [] as const,
  public_routability: "PUBLIC",
  source_storage_kind: "POST_META",
  source_state: "PUBLISHED",
  architecture_kinds: ["legacy"] as const,
  source_truth_state: "VERIFIED" as const,
  source_availability: "AVAILABLE" as const,
  elements: [] as const,
};

const bindingContext: BindingContext = {
  reference,
  selected_document: document,
  documents: [document],
  site_path_scope: "/",
};

const desktopProbe: PageProbeEvidence = {
  url: "https://example.test/",
  inner_width: 1440,
  inner_height: 900,
  page_fingerprint: hashB,
  scroll_x: 0,
  scroll_y: 0,
  document_visibility_state: "visible",
  document_prerendering: false,
  admin_bar: {
    body_admin_bar_class: false,
    wpadminbar_element_present: false,
    wpadminbar_computed_display: null,
    wpadminbar_computed_visibility: null,
    wpadminbar_rect_height: null,
    html_computed_margin_top: "0px",
    body_computed_margin_top: "0px",
    detection_state: "ABSENT",
  },
  elementor_editor_preview_present: false,
  iframe_capture: false,
  viewport_image_readiness: {
    candidate_count: 0,
    loaded_count: 0,
    broken_count: 0,
    pending_count: 0,
    decode_failed_count: 0,
    timed_out_count: 0,
    wait_time_ms: 0,
    timeout_ms: 1500,
    timeout_policy_id: "edis.viewport-image-readiness",
    timeout_policy_version: 1,
  },
};

function emptySession(): CaptureSession {
  const session = makeSession();
  return {
    ...session,
    data: {
      ...session.data,
      source_context_reference: reference,
      source_binding_state: "PROBABLE",
      captures: [],
      status: "CREATED",
    },
  };
}

function snapshotAt(
  profile: RuntimeSnapshot["viewport"]["requested_profile_id"],
  width: number,
  fingerprint = hashB,
): RuntimeSnapshot {
  const snapshot = makeSnapshot();
  return {
    ...snapshot,
    source_context_reference: reference,
    page: { ...snapshot.page, page_fingerprint: fingerprint },
    viewport: {
      ...snapshot.viewport,
      requested_profile_id: profile,
      inner_width: width,
    },
  };
}

describe("guided Minimum Python Feed capture guard", () => {
  it("requires confirmed Source Context before the first guided capture", () => {
    const result = evaluateGuidedPythonFeedCapture({
      session: {
        ...emptySession(),
        data: { ...emptySession().data, source_context_reference: null },
      },
      snapshots: [],
      bindingContext: null,
      probe: desktopProbe,
      requestedProfileId: "DESKTOP",
    });

    expect(result.allowed).toBe(false);
    expect(result.blocking_codes).toContain("EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED");
  });

  it("accepts the first required profile with a new measured width", () => {
    const result = evaluateGuidedPythonFeedCapture({
      session: emptySession(),
      snapshots: [],
      bindingContext,
      probe: desktopProbe,
      requestedProfileId: "DESKTOP",
    });

    expect(result).toMatchObject({
      allowed: true,
      measured_viewport: { width: 1440, height: 900 },
      blocking_codes: [],
    });
  });

  it("rejects duplicate required profiles and duplicate measured widths", () => {
    const desktop = snapshotAt("DESKTOP", 1440);
    const duplicateProfile = evaluateGuidedPythonFeedCapture({
      session: emptySession(),
      snapshots: [desktop],
      bindingContext,
      probe: { ...desktopProbe, inner_width: 768 },
      requestedProfileId: "DESKTOP",
    });
    const duplicateWidth = evaluateGuidedPythonFeedCapture({
      session: emptySession(),
      snapshots: [desktop],
      bindingContext,
      probe: desktopProbe,
      requestedProfileId: "TABLET",
    });

    expect(duplicateProfile.blocking_codes).toContain(
      "EDIS_RUNTIME_REQUIRED_PROFILE_ALREADY_CAPTURED",
    );
    expect(duplicateWidth.blocking_codes).toContain("EDIS_RUNTIME_DUPLICATE_MEASURED_VIEWPORT");
  });

  it("rejects a changed page and CUSTOM as a required Python Feed profile", () => {
    const desktop = snapshotAt("DESKTOP", 1440);
    const changedPage = evaluateGuidedPythonFeedCapture({
      session: emptySession(),
      snapshots: [desktop],
      bindingContext,
      probe: { ...desktopProbe, inner_width: 768, page_fingerprint: hashA },
      requestedProfileId: "TABLET",
    });
    const custom = evaluateGuidedPythonFeedCapture({
      session: emptySession(),
      snapshots: [],
      bindingContext,
      probe: desktopProbe,
      requestedProfileId: "CUSTOM",
    });

    expect(changedPage.blocking_codes).toContain("EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH");
    expect(custom.blocking_codes).toContain("EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING");
  });
});
