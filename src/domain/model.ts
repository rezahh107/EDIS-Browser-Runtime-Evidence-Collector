import type { Diagnostic } from "./diagnostics";

export const SCHEMA_VERSION = "1.0.0";
export const COLLECTOR_ID = "browser.runtime";
export const COLLECTOR_VERSION = "1.0.0";

export type ArtifactStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "FAILED";
export type IdentityConfidence = "EXACT" | "STRONG" | "PROBABLE" | "WEAK" | "UNMATCHED";
export type MatchStatus = "EXACT" | "PROBABLE" | "USER_CONFIRMED" | "UNMATCHED";
export type RedactionMode = "STRICT" | "STANDARD" | "DIAGNOSTIC";
export type CaptureStatus =
  | "CREATED"
  | "CAPTURING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";
export type EvidenceLabel =
  | "SIMULATED_VIEWPORT"
  | "USER_LABELED_VIEWPORT"
  | "OFFICIAL_MANIFEST_MATCH";

export interface ArtifactEnvelope<T> {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly artifact_type: string;
  readonly status: ArtifactStatus;
  readonly source: Readonly<{ collector_id: typeof COLLECTOR_ID; collector_version: string }>;
  readonly captured_at: string;
  readonly data: T;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportIntersection {
  readonly intersects: boolean;
  readonly ratio: number;
  readonly rect: Rect;
}

export interface ElementIdentity {
  readonly elementor_id: string | null;
  readonly data_id: string | null;
  readonly tag_name: string;
  readonly role: string | null;
  readonly class_tokens: readonly string[];
  readonly stable_dom_reference: string;
  readonly parent_reference: string | null;
  readonly sibling_index: number;
  readonly identity_strategy: string;
  readonly identity_confidence: IdentityConfidence;
}

export interface TextEvidence {
  readonly text_length: number | null;
  readonly estimated_line_count: number | null;
  readonly truncated: boolean;
  readonly heading_level: number | null;
  readonly accessible_name_status: "PRESENT" | "ABSENT" | "REDACTED" | "NOT_APPLICABLE";
  readonly preview: string | null;
}

export interface InteractiveEvidence {
  readonly interactive: boolean;
  readonly disabled: boolean;
  readonly tabindex: number | null;
  readonly aria_label_present: boolean;
  readonly accessible_name_status: "PRESENT" | "ABSENT" | "REDACTED" | "NOT_APPLICABLE";
  readonly hit_target_width: number;
  readonly hit_target_height: number;
}

export interface ElementMeasurement {
  readonly identity: ElementIdentity;
  readonly bounding_rect: Rect;
  readonly document_coordinates: Readonly<{ x: number; y: number }>;
  readonly client_width: number;
  readonly client_height: number;
  readonly scroll_width: number;
  readonly scroll_height: number;
  readonly offset_width: number;
  readonly offset_height: number;
  readonly viewport_intersection: ViewportIntersection;
  readonly area: number;
  readonly horizontal_overflow: boolean;
  readonly vertical_overflow: boolean;
  readonly offscreen: boolean;
  readonly clipped: boolean;
  readonly positioning: "static" | "relative" | "absolute" | "fixed" | "sticky" | "other";
  readonly computed_styles: Readonly<Record<string, string>>;
  readonly text: TextEvidence;
  readonly interaction: InteractiveEvidence;
}

export interface PageEvidence {
  readonly origin: string;
  readonly path: string | null;
  readonly title: string | null;
  readonly document_language: string;
  readonly document_direction: string;
  readonly ready_state: DocumentReadyState;
  readonly visibility_state: DocumentVisibilityState;
  readonly browser_family: string;
  readonly browser_version: string | null;
  readonly platform_category: "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";
  readonly elementor: Readonly<{
    page_marker_present: boolean;
    frontend_class_markers: readonly string[];
    data_elementor_id: string | null;
  }>;
  readonly site_fingerprint: string | null;
}

export interface ViewportDescriptor {
  readonly inner_width: number;
  readonly inner_height: number;
  readonly outer_width: number;
  readonly outer_height: number;
  readonly device_pixel_ratio: number;
  readonly visual_viewport: Readonly<{
    width: number;
    height: number;
    scale: number;
    offset_left: number;
    offset_top: number;
  }> | null;
  readonly orientation: string | null;
  readonly horizontal_scrollbar: boolean;
  readonly vertical_scrollbar: boolean;
  readonly zoom_evidence_status: "UNKNOWN" | "VISUAL_VIEWPORT_SCALE_OBSERVED";
  readonly user_label: string;
  readonly evidence_label: EvidenceLabel;
  readonly official_breakpoint_id: string | null;
}

export interface DocumentMetrics {
  readonly document_scroll_width: number;
  readonly document_scroll_height: number;
  readonly document_client_width: number;
  readonly document_client_height: number;
  readonly body_scroll_width: number | null;
  readonly body_scroll_height: number | null;
  readonly horizontal_page_overflow: boolean;
  readonly vertical_scroll_exists: boolean;
  readonly total_elementor_elements: number;
  readonly total_interactive_elements: number;
  readonly scanned_dom_nodes: number;
  readonly maximum_measured_depth: number;
  readonly fixed_elements: number;
  readonly sticky_elements: number;
}

export interface RuntimeSnapshotData {
  readonly snapshot_id: string;
  readonly session_id: string;
  readonly evidence_source: "PUBLISHED_FRONTEND";
  readonly page: PageEvidence;
  readonly viewport: ViewportDescriptor;
  readonly document_metrics: DocumentMetrics;
  readonly elements: readonly ElementMeasurement[];
  readonly privacy: Readonly<{
    redaction_mode: RedactionMode;
    text_preview_included: boolean;
    screenshot_requested: boolean;
    url_path_included: boolean;
    page_title_included: boolean;
    color_styles_included: boolean;
  }>;
}

export type RuntimeSnapshot = ArtifactEnvelope<RuntimeSnapshotData>;

export interface CaptureSummary {
  readonly snapshot_id: string;
  readonly label: string;
  readonly captured_at: string;
  readonly actual_width: number;
  readonly actual_height: number;
  readonly element_count: number;
  readonly overflow_count: number;
  readonly diagnostic_count: number;
  readonly screenshot_available: boolean;
  readonly status: CaptureStatus;
}

export interface CaptureSessionData {
  readonly session_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly extension_version: string;
  readonly browser_family: string;
  readonly browser_version: string | null;
  readonly linked_wordpress_bundle_id: string | null;
  readonly user_confirmed_document_id: string | null;
  readonly match_status: MatchStatus;
  readonly captures: readonly CaptureSummary[];
  readonly status: CaptureStatus;
}

export type CaptureSession = ArtifactEnvelope<CaptureSessionData>;

export interface CollectorPreferences {
  readonly schemaVersion: 1;
  readonly redactionMode: RedactionMode;
  readonly includeTextPreview: boolean;
  readonly includeScreenshot: boolean;
  readonly includeHiddenElements: boolean;
  readonly includeAccessibilityMetadata: boolean;
  readonly includePath: boolean;
  readonly includePageTitle: boolean;
  readonly includeColors: boolean;
  readonly retainAfterExport: boolean;
  readonly maxElements: number;
  readonly maxDepth: number;
  readonly maxSnapshotBytes: number;
  readonly maxTextPreviewLength: number;
}

export const DEFAULT_PREFERENCES: CollectorPreferences = {
  schemaVersion: 1,
  redactionMode: "STRICT",
  includeTextPreview: false,
  includeScreenshot: false,
  includeHiddenElements: false,
  includeAccessibilityMetadata: true,
  includePath: false,
  includePageTitle: false,
  includeColors: false,
  retainAfterExport: false,
  maxElements: 500,
  maxDepth: 24,
  maxSnapshotBytes: 8_000_000,
  maxTextPreviewLength: 120,
};

export interface CaptureJob {
  readonly id: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly tabId: number;
  readonly windowId: number;
  readonly documentUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status:
    | "PREPARED"
    | "INJECTED"
    | "RECEIVING"
    | "ASSEMBLING"
    | "COMPLETE"
    | "FAILED"
    | "CANCELLED"
    | "NAVIGATED"
    | "INTERRUPTED";
  readonly expectedChunks: number | null;
  readonly receivedChunks: number;
  readonly config: CaptureConfiguration;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CaptureConfiguration extends CollectorPreferences {
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly userLabel: string;
  readonly evidenceLabel: EvidenceLabel;
  readonly officialBreakpointId: string | null;
}

export interface ScreenshotRecord {
  readonly snapshotId: string;
  readonly sessionId: string;
  readonly mimeType: "image/png";
  readonly bytes: ArrayBuffer;
  readonly checksumSha256: string;
  readonly createdAt: string;
}
