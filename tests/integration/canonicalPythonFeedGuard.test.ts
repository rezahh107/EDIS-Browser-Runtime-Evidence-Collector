import { describe, expect, it } from "vitest";
import type {
  BindingContext,
  CaptureSession,
  PageProbeEvidence,
  RuntimeSnapshot,
  SourceContextReference,
} from "../../src/domain/model";
import { evaluateGuidedPythonFeedCapture } from "../../src/domain/pythonFeedCapture";
import { evaluatePythonFeedReadiness } from "../../src/domain/pythonFeed";
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

const selectedDocument = {
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
  selected_document: selectedDocument,
  documents: [selectedDocument],
  site_path_scope: "/",
};

function session(): CaptureSession {
  const base = makeSession();
  return {
    ...base,
    data: {
      ...base.data,
      workflow_mode: "MINIMUM_PYTHON_FEED",
      source_context_reference: reference,
      source_binding_state: "PROBABLE",
      captures: [],
      status: "CREATED",
    },
  };
}

function probe(overrides: Partial<PageProbeEvidence> = {}): PageProbeEvidence {
  return {
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
      candidate_count: 2,
      loaded_count: 2,
      broken_count: 0,
      pending_count: 0,
      decode_failed_count: 0,
      timed_out_count: 0,
      wait_time_ms: 12,
      timeout_ms: 1500,
      timeout_policy_id: "edis.viewport-image-readiness",
      timeout_policy_version: 1,
    },
    ...overrides,
  };
}

function guard(overrides: Partial<PageProbeEvidence>) {
  return evaluateGuidedPythonFeedCapture({
    session: session(),
    snapshots: [],
    bindingContext,
    probe: probe(overrides),
    requestedProfileId: "DESKTOP",
  });
}

describe("canonical Minimum Python Feed guard", () => {
  it("blocks nonzero scroll before a capture job can be created", () => {
    const result = guard({ scroll_y: 3024 });
    expect(result.allowed).toBe(false);
    expect(result.blocking_codes).toContain("EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL");
  });

  it("blocks both present and ambiguous WordPress Admin Bar evidence", () => {
    const result = guard({
      admin_bar: {
        ...probe().admin_bar,
        body_admin_bar_class: true,
        detection_state: "AMBIGUOUS",
      },
    });
    expect(result.blocking_codes).toContain(
      "EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS",
    );
  });

  it("blocks hidden and prerendering pages but does not use document focus as a gate", () => {
    const hidden = guard({ document_visibility_state: "hidden" });
    const prerendering = guard({ document_prerendering: true });
    expect(hidden.blocking_codes).toContain("EDIS_RUNTIME_PAGE_NOT_VISIBLE");
    expect(prerendering.blocking_codes).toContain("EDIS_RUNTIME_PAGE_PRERENDERING");
  });

  it("blocks unresolved viewport images after the bounded wait", () => {
    const result = guard({
      viewport_image_readiness: {
        ...probe().viewport_image_readiness,
        loaded_count: 1,
        timed_out_count: 1,
      },
    });
    expect(result.blocking_codes).toContain("EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY");
  });

  it("allows any capture order while preserving unique profile and measured-width requirements", () => {
    const mobile = makeSnapshot();
    const existing: RuntimeSnapshot = {
      ...mobile,
      viewport: { ...mobile.viewport, requested_profile_id: "MOBILE", inner_width: 390 },
      source_context_reference: reference,
    };
    const result = evaluateGuidedPythonFeedCapture({
      session: session(),
      snapshots: [existing],
      bindingContext,
      probe: probe({ inner_width: 768 }),
      requestedProfileId: "TABLET",
    });
    expect(result.allowed).toBe(true);
  });

  it("marks persisted noncanonical observations insufficient for Python Feed export", async () => {
    const desktop = makeSnapshot();
    const snapshots = [
      desktop,
      {
        ...desktop,
        snapshot_id: "523e4567-e89b-42d3-a456-426614174000",
        observation_index: 1,
        viewport: {
          ...desktop.viewport,
          requested_profile_id: "TABLET" as const,
          inner_width: 768,
        },
        capture_state: { ...desktop.capture_state, scroll_y: 100 },
      },
      {
        ...desktop,
        snapshot_id: "623e4567-e89b-42d3-a456-426614174000",
        observation_index: 2,
        viewport: {
          ...desktop.viewport,
          requested_profile_id: "MOBILE" as const,
          inner_width: 390,
        },
      },
    ];
    const result = await evaluatePythonFeedReadiness({
      session: {
        ...session(),
        data: {
          ...session().data,
          captures: [],
        },
      },
      snapshots,
      sourceContext: null,
    });
    expect(result.canonical_scroll_state).toBe(false);
    expect(result.noncanonical_scroll_observations).toEqual([1]);
    expect(result.blocking_codes).toContain("EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL");
  });

  it("T06_PYTHON_FEED_ERROR_BLOCK: readiness ERROR blocks an otherwise canonical feed", async () => {
    const desktop = makeSnapshot();
    const snapshots: RuntimeSnapshot[] = [
      {
        ...desktop,
        source_context_reference: reference,
        capture_readiness: {
          ...desktop.capture_readiness,
          process_state: "ERROR",
          availability: "ERROR",
        },
      },
      {
        ...desktop,
        snapshot_id: "523e4567-e89b-42d3-a456-426614174000",
        observation_index: 1,
        source_context_reference: reference,
        viewport: { ...desktop.viewport, requested_profile_id: "TABLET", inner_width: 768 },
      },
      {
        ...desktop,
        snapshot_id: "623e4567-e89b-42d3-a456-426614174000",
        observation_index: 2,
        source_context_reference: reference,
        viewport: { ...desktop.viewport, requested_profile_id: "MOBILE", inner_width: 390 },
      },
    ];
    const result = await evaluatePythonFeedReadiness({
      session: session(),
      snapshots,
      sourceContext: null,
    });
    expect(result.state).not.toBe("READY");
    expect(result.export_allowed).toBe(false);
    expect(result.blocking_codes).toContain("EDIS_RUNTIME_READINESS_ERROR");
  });
});
