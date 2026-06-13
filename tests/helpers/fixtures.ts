import {
  COLLECTOR_ID,
  SCHEMA_VERSION,
  type CaptureSession,
  type RuntimeSnapshot,
} from "../../src/domain/model";

export const sessionId = "123e4567-e89b-12d3-a456-426614174000";
export const snapshotId = "223e4567-e89b-12d3-a456-426614174000";
export const capturedAt = "2026-06-13T10:00:00.000Z";

export function makeSession(): CaptureSession {
  return {
    schema_version: SCHEMA_VERSION,
    artifact_type: "capture_session",
    status: "AVAILABLE",
    source: { collector_id: COLLECTOR_ID, collector_version: "1.0.0" },
    captured_at: capturedAt,
    data: {
      session_id: sessionId,
      name: "Test session",
      created_at: capturedAt,
      extension_version: "1.0.0",
      browser_family: "Chrome",
      browser_version: "116",
      linked_wordpress_bundle_id: null,
      user_confirmed_document_id: null,
      match_status: "UNMATCHED",
      captures: [
        {
          snapshot_id: snapshotId,
          label: "Desktop",
          captured_at: capturedAt,
          actual_width: 1280,
          actual_height: 720,
          element_count: 0,
          overflow_count: 0,
          diagnostic_count: 0,
          screenshot_available: false,
          status: "COMPLETE",
        },
      ],
      status: "COMPLETE",
    },
    diagnostics: [],
  };
}

export function makeSnapshot(): RuntimeSnapshot {
  return {
    schema_version: SCHEMA_VERSION,
    artifact_type: "runtime_snapshot",
    status: "AVAILABLE",
    source: { collector_id: COLLECTOR_ID, collector_version: "1.0.0" },
    captured_at: capturedAt,
    data: {
      snapshot_id: snapshotId,
      session_id: sessionId,
      evidence_source: "PUBLISHED_FRONTEND",
      page: {
        origin: "https://example.test",
        path: null,
        title: null,
        document_language: "en",
        document_direction: "ltr",
        ready_state: "complete",
        visibility_state: "visible",
        browser_family: "Chrome",
        browser_version: "116",
        platform_category: "DESKTOP",
        elementor: {
          page_marker_present: false,
          frontend_class_markers: [],
          data_elementor_id: null,
        },
        site_fingerprint: null,
      },
      viewport: {
        inner_width: 1280,
        inner_height: 720,
        outer_width: 1280,
        outer_height: 800,
        device_pixel_ratio: 1,
        visual_viewport: { width: 1280, height: 720, scale: 1, offset_left: 0, offset_top: 0 },
        orientation: "landscape-primary",
        horizontal_scrollbar: false,
        vertical_scrollbar: true,
        zoom_evidence_status: "UNKNOWN",
        user_label: "Desktop",
        evidence_label: "USER_LABELED_VIEWPORT",
        official_breakpoint_id: null,
      },
      document_metrics: {
        document_scroll_width: 1280,
        document_scroll_height: 1400,
        document_client_width: 1280,
        document_client_height: 720,
        body_scroll_width: 1280,
        body_scroll_height: 1400,
        horizontal_page_overflow: false,
        vertical_scroll_exists: true,
        total_elementor_elements: 0,
        total_interactive_elements: 0,
        scanned_dom_nodes: 1,
        maximum_measured_depth: 0,
        fixed_elements: 0,
        sticky_elements: 0,
      },
      elements: [],
      privacy: {
        redaction_mode: "STRICT",
        text_preview_included: false,
        screenshot_requested: false,
        url_path_included: false,
        page_title_included: false,
        color_styles_included: false,
      },
    },
    diagnostics: [],
  };
}
