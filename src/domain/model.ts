import type { Diagnostic } from "./diagnostics";

export const SCHEMA_VERSION = "1.6.0";
export const RUNTIME_PACKAGE_SCHEMA_VERSION = "1.4.1";
export const SHARED_ENVELOPE_SCHEMA_VERSION = "1.0.0";
export const COLLECTOR_ID = "browser.runtime";
export const COLLECTOR_VERSION = "1.6.20";
export const HASH_ALGORITHM = "sha256";
export const CANONICALIZATION_PROFILE = "EDIS-CJ-1";
export const URL_NORMALIZATION_PROFILE = "EDIS-URL-1";

export type HashDigest = `sha256:${string}`;
export const RUNTIME_AVAILABILITIES = [
  "AVAILABLE",
  "PARTIAL",
  "INSUFFICIENT",
  "DISABLED",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
  "ERROR",
] as const;
export type RuntimeAvailability = (typeof RUNTIME_AVAILABILITIES)[number];

export function isRuntimeAvailability(value: unknown): value is RuntimeAvailability {
  return typeof value === "string" && (RUNTIME_AVAILABILITIES as readonly string[]).includes(value);
}
export type ValidationState = "PASS" | "FAIL" | "NOT_RUN";
export type BindingState = "EXACT" | "PROBABLE" | "AMBIGUOUS" | "UNMATCHED";
export type ConfirmationState = "NOT_CONFIRMED" | "CONFIRMED";
export type SourceTruthState = "VERIFIED" | "PARTIAL" | "UNKNOWN" | "UNSUPPORTED";
export type ArtifactStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "FAILED";
export type IdentityConfidence = "EXACT" | "STRONG" | "PROBABLE" | "WEAK" | "UNMATCHED";
export type IdentitySource = "HTML_ID" | "DATA_TEST_ID" | "STRUCTURAL_PATH" | "UNMATCHED";
export type IdentityStatus = "UNIQUE" | "AMBIGUOUS" | "UNMATCHED";
export type SessionSourceBindingState = BindingState;
export type RedactionMode = "STRICT" | "STANDARD" | "DIAGNOSTIC";
export type CaptureProfile = "STANDARD" | "DEEP_DOM" | "CUSTOM";
export type CaptureIntent =
  | "GENERAL_AUDIT"
  | "RESPONSIVE_COMPARISON"
  | "TYPOGRAPHY_AUDIT"
  | "INTERACTION_AUDIT"
  | "OVERFLOW_INVESTIGATION";
export type CaptureStatus =
  | "CREATED"
  | "CAPTURING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";
export type EvidenceLabel = "SIMULATED_VIEWPORT" | "USER_LABELED_VIEWPORT";
export type CaptureWorkflowMode = "RUNTIME_EVIDENCE" | "MINIMUM_PYTHON_FEED";
export const REQUESTED_VIEWPORT_PROFILES = ["DESKTOP", "TABLET", "MOBILE", "CUSTOM"] as const;
export type RequestedViewportProfile = (typeof REQUESTED_VIEWPORT_PROFILES)[number];

export function isRequestedViewportProfile(value: unknown): value is RequestedViewportProfile {
  return (
    typeof value === "string" && (REQUESTED_VIEWPORT_PROFILES as readonly string[]).includes(value)
  );
}
export type StructureLabelSource =
  | "ELEMENTOR_EDITOR_LABEL"
  | "HTML_ID"
  | "LANDMARK_TAG"
  | "TECHNICAL_MARKER"
  | "NONE";

export interface ArtifactEnvelope<T> {
  readonly schema_id: string;
  readonly schema_version: string;
  readonly artifact_type: string;
  readonly producer: Readonly<{ product: string; version: string }>;
  readonly captured_at: string;
  readonly canonicalization: Readonly<{
    profile: typeof CANONICALIZATION_PROFILE;
    hash_algorithm: typeof HASH_ALGORITHM;
  }>;
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

export interface RuntimeEnvironment {
  readonly browser_family: string;
  readonly browser_version: string | null;
  readonly platform_category: "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";
}

export interface RuntimeElementorMarkers {
  readonly data_elementor_id: string | null;
  readonly data_id: string | null;
  readonly elementor_class_marker_present: boolean;
  readonly widget_class_markers: readonly string[];
  readonly structure_class_markers: readonly string[];
}

export interface SourceBindingEvidence {
  readonly availability: RuntimeAvailability;
  readonly binding_state: BindingState;
  readonly binding_basis:
    | "DIRECT_VALIDATED_MARKER"
    | "ANCESTOR_VALIDATED_MARKER"
    | "RAW_MARKER_ONLY"
    | "NO_SOURCE_CONTEXT"
    | "NO_MATCH";
  readonly page_elementor_document_id: string | null;
  readonly elementor_element_id: string | null;
  readonly nearest_elementor_ancestor_id: string | null;
  readonly elementor_ancestor_ids: readonly string[];
  readonly runtime_id_occurrence_count: number;
  readonly source_id_occurrence_count: number | null;
  readonly source_document_id: string | null;
  readonly source_element_key: HashDigest | null;
  readonly source_record_sha256: HashDigest | null;
  readonly unique_in_runtime_document: boolean;
  readonly unique_in_source_document: boolean | null;
  readonly confirmation_state: ConfirmationState;
  readonly reason_codes: readonly string[];
  readonly source_document_type: string | null;
  readonly source_element_kind: string | null;
  readonly source_widget_type: string | null;
  readonly source_architecture_kind: string | null;
  readonly source_editor_label: string | null;
  readonly source_editor_label_source: "ELEMENTOR_EDITOR_METADATA" | null;
  readonly source_section_key: HashDigest | null;
  readonly source_section_element_id: string | null;
  readonly source_section_kind: string | null;
}

export interface ElementIdentity {
  readonly tag_name: string;
  readonly role: string | null;
  readonly class_tokens: readonly string[];
  readonly stable_dom_reference: string;
  readonly reference_sha256: HashDigest;
  readonly sibling_index: number;
  readonly identity_source: IdentitySource;
  readonly identity_strategy: string;
  readonly identity_confidence: IdentityConfidence;
  readonly identity_status: IdentityStatus;
  readonly unique_in_document: boolean;
  readonly reference_occurrence_count: number;
  readonly collision_count: number;
}

export interface RelationshipEvidence {
  readonly dom_parent_reference: string | null;
  readonly dom_parent_reference_sha256: HashDigest | null;
  readonly dom_parent_emitted: boolean;
  readonly nearest_emitted_parent_node_id: string | null;
  readonly nearest_positioned_ancestor_reference: string | null;
  readonly nearest_positioned_ancestor_node_id: string | null;
  readonly nearest_scroll_ancestor_reference: string | null;
  readonly nearest_scroll_ancestor_node_id: string | null;
  readonly nearest_clipping_ancestor_reference: string | null;
  readonly nearest_clipping_ancestor_node_id: string | null;
  readonly sibling_index: number;
  readonly sibling_count: number;
  readonly child_element_count: number;
  readonly dom_depth: number;
  readonly availability: RuntimeAvailability;
}

export interface InteractionFacts {
  readonly availability: RuntimeAvailability;
  readonly tag_name: string;
  readonly role: string | null;
  readonly native_interactive_kind: string | null;
  readonly tab_index: number | null;
  readonly disabled: boolean;
  readonly aria_disabled: boolean | null;
  readonly aria_expanded: boolean | null;
  readonly aria_controls_present: boolean;
  readonly href_present: boolean;
  readonly input_type: string | null;
  readonly contenteditable: boolean;
  readonly pointer_events: string;
  readonly cursor: string;
}

export type TextShapeMeasurementStatus =
  | "MEASURED"
  | "NO_TEXT"
  | "EXCLUDED_SENSITIVE_CONTROL"
  | "EXCLUDED_CONTENTEDITABLE"
  | "UNAVAILABLE"
  | "BOUNDED_LIMIT_REACHED"
  | "ERROR";

export interface TextShapeEvidence {
  readonly availability: RuntimeAvailability;
  readonly measurement_status: TextShapeMeasurementStatus;
  readonly measurement_method: "RANGE_CLIENT_RECTS" | "TEXT_CONTENT_SHAPE" | "NONE";
  readonly text_present: boolean;
  readonly text_node_count: number;
  readonly grapheme_count: number | null;
  readonly word_count: number | null;
  readonly rendered_line_box_count: number | null;
  readonly longest_unbroken_token_length: number | null;
  readonly white_space: string;
  readonly overflow_wrap: string;
  readonly word_break: string;
  readonly text_overflow: string;
  readonly line_clamp: number | null;
  readonly horizontal_clipping: boolean;
  readonly vertical_clipping: boolean;
  readonly preview: string | null;
  readonly preview_truncated: boolean;
}

export interface VisibilityEvidence {
  readonly display: string;
  readonly visibility: string;
  readonly opacity: number | null;
  readonly direct_hidden: boolean;
  readonly hidden_by_ancestor: boolean;
  readonly nearest_hidden_ancestor_reference: string | null;
  readonly nearest_hidden_ancestor_node_id: string | null;
  readonly rendered: boolean;
  readonly effective_rendered: boolean;
  readonly has_box: boolean;
  readonly intersects_viewport: boolean;
}

export interface OverflowEvidence {
  readonly client_width: number;
  readonly client_height: number;
  readonly scroll_width: number;
  readonly scroll_height: number;
  readonly offset_width: number;
  readonly offset_height: number;
  readonly horizontal_overflow: boolean;
  readonly vertical_overflow: boolean;
  readonly clipped_by_ancestor: boolean;
}

export interface EvidenceLineage {
  readonly page_context_id: HashDigest;
  readonly snapshot_id: string;
  readonly runtime_node_id: string;
  readonly source_document_id: string | null;
  readonly source_document_type: string | null;
  readonly source_element_key: HashDigest | null;
  readonly source_section_key: HashDigest | null;
  readonly binding_state: BindingState;
}

export interface ElementMeasurement {
  readonly node_id: string;
  readonly document_order: number;
  readonly evidence_lineage: EvidenceLineage;
  readonly identity: ElementIdentity;
  readonly runtime_elementor_markers: RuntimeElementorMarkers;
  readonly source_binding: SourceBindingEvidence;
  readonly relationships: RelationshipEvidence;
  readonly bounding_rect: Rect;
  readonly document_coordinates: Readonly<{ x: number; y: number }>;
  readonly viewport_intersection: ViewportIntersection;
  readonly area: number;
  readonly positioning: "static" | "relative" | "absolute" | "fixed" | "sticky" | "other";
  readonly computed_styles: Readonly<Record<string, string>>;
  readonly visibility: VisibilityEvidence;
  readonly overflow: OverflowEvidence;
  readonly interaction_facts: InteractionFacts;
  readonly text_shape: TextShapeEvidence;
  readonly runtime_instance: RuntimeInstanceEvidence;
  readonly computed_style_origin: ComputedStyleOriginAvailability;
}

export interface UrlLocatorFacts {
  readonly scheme: "http" | "https";
  readonly host_ascii: string;
  readonly port: number | null;
  readonly path: string;
  readonly site_path_scope: string;
}

export interface PageBindingEvidence {
  readonly availability: RuntimeAvailability;
  readonly binding_state: BindingState;
  readonly source_document_id: string | null;
  readonly source_document_fingerprint: HashDigest | null;
  readonly page_locator_candidate_match: boolean;
  readonly page_elementor_document_id: string | null;
  readonly confirmation_state: ConfirmationState;
  readonly reason_codes: readonly string[];
}

export interface RuntimeInstanceEvidence {
  readonly availability: RuntimeAvailability;
  readonly instance_state:
    | "SINGLE_RENDER"
    | "REPEATED_TEMPLATE"
    | "NESTED_COMPONENT"
    | "MULTIPLE_RUNTIME_ROOTS"
    | "UNKNOWN";
  readonly instance_group_id: HashDigest | null;
  readonly instance_index: number | null;
  readonly observed_instance_count: number;
  readonly source_element_key: HashDigest | null;
  readonly source_document_id: string | null;
  readonly instance_basis: "SHARED_SOURCE_ELEMENT_KEY" | "NO_VALIDATED_SOURCE_KEY";
  readonly basis_evidence: readonly string[];
}

export interface ComputedStyleOriginAvailability {
  readonly availability: RuntimeAvailability;
  readonly observation_kind: "RESOLVED_COMPUTED_VALUE_ONLY";
  readonly cssom_rule_inspection_performed: false;
  readonly matched_rule_accessibility: "NOT_MEASURED";
  readonly custom_property_reference_observation: "NOT_MEASURED";
}

export interface CaptureConfigurationEvidence {
  readonly capture_profile: CaptureProfile;
  readonly max_elements: number;
  readonly max_depth: number;
  readonly max_snapshot_bytes: number;
  readonly include_hidden_elements: boolean;
  readonly include_colors: boolean;
  readonly include_text_shape: boolean;
  readonly include_interaction_facts: boolean;
  readonly include_relationship_graph: boolean;
  readonly include_text_preview: boolean;
  readonly text_preview_limit: number;
  readonly readiness_hard_timeout_ms: number;
}

export interface SourceDocumentPresence {
  readonly document_id: string;
  readonly document_type: string;
  readonly document_fingerprint: HashDigest;
  readonly binding_states: readonly BindingState[];
  readonly bound_runtime_node_count: number;
}

export interface PageEvidence {
  readonly page_context_id: HashDigest;
  readonly origin: string;
  readonly path: string | null;
  readonly title: string | null;
  readonly document_language: string;
  readonly document_direction: string;
  readonly ready_state: DocumentReadyState;
  readonly visibility_state: DocumentVisibilityState;
  readonly browser_family: string;
  readonly browser_version: string | null;
  readonly platform_category: RuntimeEnvironment["platform_category"];
  readonly locator_facts: UrlLocatorFacts | null;
  readonly locator_disclosure: "RAW" | "HASH_ONLY";
  readonly page_locator_sha256: HashDigest;
  readonly page_fingerprint: HashDigest;
  readonly elementor: Readonly<{
    page_marker_present: boolean;
    frontend_class_markers: readonly string[];
    raw_data_elementor_ids: readonly string[];
    page_elementor_document_id: string | null;
  }>;
  readonly imported_site_fingerprint: HashDigest | null;
  readonly page_binding_evidence: PageBindingEvidence;
  readonly source_documents_present: readonly SourceDocumentPresence[];
}

export type AdminBarDetectionState = "ABSENT" | "PRESENT" | "AMBIGUOUS";

export interface AdminBarEvidence {
  readonly body_admin_bar_class: boolean;
  readonly wpadminbar_element_present: boolean;
  readonly wpadminbar_computed_display: string | null;
  readonly wpadminbar_computed_visibility: string | null;
  readonly wpadminbar_rect_height: number | null;
  readonly html_computed_margin_top: string;
  readonly body_computed_margin_top: string | null;
  readonly detection_state: AdminBarDetectionState;
}

export interface ViewportImageReadinessEvidence {
  readonly candidate_count: number;
  readonly loaded_count: number;
  readonly broken_count: number;
  readonly pending_count: number;
  readonly decode_failed_count: number;
  readonly timed_out_count: number;
  readonly wait_time_ms: number;
  readonly timeout_ms: number;
  readonly timeout_policy_id: string;
  readonly timeout_policy_version: number;
}

export interface PageProbeEvidence {
  readonly url: string;
  readonly inner_width: number;
  readonly inner_height: number;
  readonly page_fingerprint: HashDigest;
  readonly scroll_x: number;
  readonly scroll_y: number;
  readonly document_visibility_state: DocumentVisibilityState;
  readonly document_prerendering: boolean;
  readonly admin_bar: AdminBarEvidence;
  readonly elementor_editor_preview_present: boolean;
  readonly iframe_capture: boolean;
  readonly viewport_image_readiness: ViewportImageReadinessEvidence;
}

export interface PythonFeedCaptureGuard {
  readonly allowed: boolean;
  readonly policy_id: string;
  readonly policy_version: number;
  readonly measured_viewport: Readonly<{ width: number; height: number }>;
  readonly page_fingerprint: HashDigest;
  readonly existing_viewport_widths: readonly number[];
  readonly existing_requested_profiles: readonly RequestedViewportProfile[];
  readonly blocking_codes: readonly string[];
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
  readonly requested_profile_id: RequestedViewportProfile;
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
  /** @deprecated Use discovered_elementor_elements. */
  readonly total_elementor_elements: number;
  /** @deprecated Use discovered_interactive_candidates. */
  readonly total_interactive_elements: number;
  readonly discovered_elementor_elements: number;
  readonly emitted_elementor_elements: number;
  readonly skipped_elementor_elements: number;
  readonly discovered_interactive_candidates: number;
  readonly emitted_interactive_candidates: number;
  readonly discovered_fixed_elements: number;
  readonly emitted_fixed_elements: number;
  readonly discovered_sticky_elements: number;
  readonly emitted_sticky_elements: number;
  readonly scanned_dom_nodes: number;
  readonly emitted_elements: number;
  readonly maximum_measured_depth: number;
  readonly truncated_branch_count: number;
  /** @deprecated Use discovered_fixed_elements. */
  readonly fixed_elements: number;
  /** @deprecated Use discovered_sticky_elements. */
  readonly sticky_elements: number;
  readonly skipped_hidden_subtree_count: number;
  readonly skipped_hidden_direct_child_count: number;
}

export interface StructureLabelEvidence {
  readonly value: string | null;
  readonly source: StructureLabelSource;
  readonly availability: RuntimeAvailability;
}

export interface RuntimeRegion {
  readonly region_node_id: string;
  readonly region_kind:
    | "HTML_LANDMARK"
    | "HTML_SECTION"
    | "ELEMENTOR_SECTION"
    | "ELEMENTOR_CONTAINER"
    | "ATOMIC_CONTAINER";
  readonly tag_name: string;
  readonly landmark_role: string | null;
  readonly runtime_parent_region_node_id: string | null;
  readonly source_binding_state: BindingState;
  readonly source_document_id: string | null;
  readonly source_section_key: HashDigest | null;
  readonly section_label: StructureLabelEvidence;
  readonly bounding_rect: Rect;
}

export interface PageStructureSummary {
  readonly source_document_count: number;
  readonly source_section_count: number;
  readonly source_widget_count: number;
  readonly runtime_region_count: number;
  readonly runtime_section_region_count: number;
  readonly runtime_container_region_count: number;
  readonly runtime_widget_marker_count: number;
  readonly exact_binding_count: number;
  readonly probable_binding_count: number;
  readonly ambiguous_binding_count: number;
  readonly unmatched_runtime_node_count: number;
  readonly document_instance_count: number;
  readonly repeated_runtime_instance_group_count: number;
}

export interface CaptureCompleteness {
  readonly status: "COMPLETE" | "PARTIAL";
  readonly reasons: readonly string[];
  readonly capture_profile: CaptureProfile;
  readonly elements_visited: number;
  readonly elements_emitted: number;
  readonly maximum_depth_observed: number;
  readonly truncated_branch_count: number;
  readonly element_budget: number;
  readonly element_budget_used: number;
  readonly scan_budget: number;
  readonly scan_budget_used: number;
  readonly identity_collision_count: number;
  readonly skipped_hidden_subtree_count: number;
  readonly skipped_hidden_direct_child_count: number;
}

export interface CaptureReadiness {
  readonly availability: RuntimeAvailability;
  readonly process_state: "STABLE" | "UNSTABLE" | "TIMEOUT" | "INSUFFICIENT" | "ERROR";
  readonly document_ready_state: DocumentReadyState;
  readonly fonts_api_available: boolean;
  readonly fonts_status: string | null;
  /** @deprecated Use incomplete_image_count_total. */
  readonly incomplete_image_count: number;
  readonly incomplete_image_count_total: number;
  readonly incomplete_image_count_in_viewport: number;
  readonly viewport_image_readiness: ViewportImageReadinessEvidence;
  readonly active_animation_count: number;
  readonly initial_document_width: number;
  readonly final_document_width: number;
  readonly initial_document_height: number;
  readonly final_document_height: number;
  readonly initial_viewport_width: number;
  readonly final_viewport_width: number;
  readonly initial_viewport_height: number;
  readonly final_viewport_height: number;
  readonly sample_count: number;
  readonly settle_duration_ms: number;
  readonly hard_timeout_ms: number;
  readonly timeout_reached: boolean;
}

export interface CaptureStateEvidence {
  readonly scroll_x: number;
  readonly scroll_y: number;
  readonly document_visibility_state: DocumentVisibilityState;
  readonly document_prerendering: boolean;
  readonly document_has_focus: boolean;
  readonly active_element_reference_sha256: HashDigest | null;
  readonly prefers_reduced_motion: boolean;
  readonly pointer_capability: "FINE" | "COARSE" | "NONE" | "UNKNOWN";
  readonly hover_capability: "HOVER" | "NONE" | "UNKNOWN";
  readonly animation_count: number;
  readonly sticky_candidate_count: number;
  readonly capture_trigger: "USER_INITIATED";
}

export interface CaptureEnvironmentEvidence {
  readonly wordpress_admin_bar_present: boolean;
  readonly admin_bar: AdminBarEvidence;
  readonly elementor_editor_preview_present: boolean;
  readonly iframe_capture: boolean;
  readonly document_not_focused: boolean;
  readonly page_not_at_top: boolean;
  readonly open_html_dialog_count: number;
  readonly aria_modal_true_count: number;
  readonly body_pointer_events: string | null;
  readonly visible_modal_count: number;
  readonly active_animations_present: boolean;
  readonly incomplete_images_in_viewport: number;
  readonly viewport_image_readiness: ViewportImageReadinessEvidence;
  readonly warning_codes: readonly string[];
}

export interface DocumentInstanceEvidence {
  readonly document_instance_id: string;
  readonly source_document_id: string;
  readonly source_document_type: string;
  readonly runtime_root_node_ids: readonly string[];
  readonly bound_runtime_node_count: number;
  readonly instance_index: number;
  readonly binding_state: BindingState;
  readonly basis_evidence: readonly string[];
}

export type SourceRuntimeCardinalityState = "ZERO" | "ONE" | "ONE_TO_MANY";

export interface SourceRuntimeCardinalityRecord {
  readonly source_document_id: string;
  readonly source_element_key: HashDigest;
  readonly runtime_candidate_count: number;
  readonly runtime_candidate_node_ids: readonly string[];
  readonly cardinality_state: SourceRuntimeCardinalityState;
  readonly absence_reason_codes: readonly string[];
}

export interface SourceRuntimeCardinalityEvidence {
  readonly availability: RuntimeAvailability;
  readonly source_elements_imported: number;
  readonly source_elements_with_zero_candidates: number;
  readonly source_elements_with_one_candidate: number;
  readonly source_elements_with_multiple_candidates: number;
  readonly runtime_nodes_without_source_candidate: number;
  readonly records: readonly SourceRuntimeCardinalityRecord[];
}

export interface SourceContextReference {
  readonly analysis_set_id: string | null;
  readonly wordpress_bundle_id: string;
  readonly imported_source_context_sha256: HashDigest;
  readonly source_export_root_sha256: HashDigest;
  readonly site_fingerprint: HashDigest;
  readonly selected_document_id: string | null;
  readonly selected_document_fingerprint: HashDigest | null;
  readonly confirmation_state: ConfirmationState;
}

export interface BridgeElementRecord {
  readonly document_id: string;
  readonly source_element_key: HashDigest;
  readonly source_record_sha256: HashDigest;
  readonly elementor_element_id: string | null;
  readonly id_occurrence_count: number;
  readonly id_uniqueness: "UNIQUE" | "DUPLICATE" | "MISSING";
  readonly parent_elementor_id: string | null;
  readonly ancestor_elementor_ids: readonly string[];
  readonly source_path: string;
  readonly document_order: number;
  readonly element_kind: string;
  readonly el_type: string | null;
  readonly widget_type: string | null;
  readonly architecture_kind: string;
  readonly source_truth_state: SourceTruthState;
  readonly source_availability: RuntimeAvailability;
  readonly editor_label?: string | null;
  readonly editor_label_source?: "ELEMENTOR_EDITOR_METADATA" | null;
}

export interface BridgeDocumentRecord {
  readonly document_id: string;
  readonly document_type: string;
  readonly document_fingerprint: HashDigest;
  readonly saved_source_sha256: HashDigest;
  readonly page_locator_candidates: readonly HashDigest[];
  readonly public_routability: string;
  readonly source_storage_kind: string;
  readonly source_state: string;
  readonly architecture_kinds: readonly string[];
  readonly source_truth_state: SourceTruthState;
  readonly source_availability: RuntimeAvailability;
  readonly elements: readonly BridgeElementRecord[];
}

export interface ImportedSourceContextData {
  readonly analysis_set_id: string | null;
  readonly wordpress_bundle_id: string;
  readonly source_export_root_sha256: HashDigest;
  readonly site_fingerprint: HashDigest;
  readonly url_normalization_profile: typeof URL_NORMALIZATION_PROFILE;
  readonly site_locator_candidates: readonly HashDigest[];
  readonly multisite_mode: string;
  readonly site_path_scope: string;
  readonly source_truth_state: SourceTruthState;
  readonly source_availability: RuntimeAvailability;
  readonly documents: readonly BridgeDocumentRecord[];
}

export type ImportedSourceContext = ArtifactEnvelope<ImportedSourceContextData>;

export interface RuntimeSnapshot {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly artifact_type: "runtime_snapshot";
  readonly status: ArtifactStatus;
  readonly source: Readonly<{ collector_id: typeof COLLECTOR_ID; collector_version: string }>;
  readonly captured_at: string;
  readonly snapshot_id: string;
  readonly session_id: string;
  readonly observation_index: number;
  readonly capture_intent: CaptureIntent;
  readonly capture_configuration: CaptureConfigurationEvidence;
  readonly evidence_source: "PUBLISHED_FRONTEND";
  readonly runtime_environment: RuntimeEnvironment;
  readonly source_context_reference: SourceContextReference | null;
  readonly page: PageEvidence;
  readonly viewport: ViewportDescriptor;
  readonly document_metrics: DocumentMetrics;
  readonly capture_readiness: CaptureReadiness;
  readonly capture_state: CaptureStateEvidence;
  readonly capture_environment: CaptureEnvironmentEvidence;
  readonly capture_completeness: CaptureCompleteness;
  readonly runtime_structure_sha256: HashDigest;
  readonly runtime_regions: readonly RuntimeRegion[];
  readonly page_structure_summary: PageStructureSummary;
  readonly document_instances: readonly DocumentInstanceEvidence[];
  readonly source_runtime_cardinality: SourceRuntimeCardinalityEvidence;
  readonly elements: readonly ElementMeasurement[];
  readonly privacy: Readonly<{
    redaction_mode: RedactionMode;
    screenshot_requested: boolean;
    url_path_included: boolean;
    locator_facts_included: boolean;
    locator_path_disclosure: "RAW" | "HASH_ONLY";
    page_title_included: boolean;
    color_styles_included: boolean;
    text_preview_requested: boolean;
    text_preview_limit: number;
  }>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CaptureSummary {
  readonly snapshot_id: string;
  readonly label: string;
  readonly captured_at: string;
  readonly actual_width: number;
  readonly actual_height: number;
  readonly page_context_id: HashDigest;
  readonly page_fingerprint: HashDigest;
  readonly page_binding_state: BindingState;
  readonly page_binding_reason_codes: readonly string[];
  readonly source_document_id: string | null;
  readonly source_document_type: string | null;
  readonly source_document_count: number;
  readonly source_section_count: number;
  readonly source_widget_count: number;
  readonly runtime_region_count: number;
  readonly runtime_section_region_count: number;
  readonly runtime_container_region_count: number;
  readonly runtime_widget_marker_count: number;
  readonly exact_binding_count: number;
  readonly probable_binding_count: number;
  readonly ambiguous_binding_count: number;
  readonly unmatched_runtime_node_count: number;
  readonly element_count: number;
  readonly overflow_count: number;
  readonly diagnostic_count: number;
  readonly screenshot_available: boolean;
  readonly completeness_status: "COMPLETE" | "PARTIAL";
  readonly partial_reasons: readonly string[];
  readonly truncated_branch_count: number;
  readonly identity_collision_count: number;
  readonly skipped_hidden_subtree_count: number;
  readonly capture_environment_warning_count: number;
  readonly status: CaptureStatus;
}

export interface CaptureSessionData {
  readonly session_id: string;
  readonly observation_set_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly extension_version: string;
  readonly browser_family: string;
  readonly browser_version: string | null;
  readonly runtime_environment: RuntimeEnvironment | null;
  readonly source_context_reference: SourceContextReference | null;
  readonly source_binding_state: SessionSourceBindingState;
  readonly workflow_mode: CaptureWorkflowMode | null;
  readonly captures: readonly CaptureSummary[];
  readonly status: CaptureStatus;
}

export type CaptureSession = ArtifactEnvelope<CaptureSessionData>;

/** Lightweight UI projection. It is not an exported evidence artifact. */
export interface CaptureSessionSummary {
  readonly session_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly status: CaptureStatus;
  readonly workflow_mode: CaptureWorkflowMode | null;
  readonly capture_count: number;
  readonly latest_capture: CaptureSummary | null;
}

export interface CollectorPreferences {
  readonly schemaVersion: 5;
  readonly captureProfile: CaptureProfile;
  readonly captureIntent: CaptureIntent;
  readonly redactionMode: RedactionMode;
  readonly includeScreenshot: boolean;
  readonly includeHiddenElements: boolean;
  readonly includePath: boolean;
  readonly includePageTitle: boolean;
  readonly includeColors: boolean;
  readonly includeTextPreview: boolean;
  readonly includeTextShape: boolean;
  readonly includeInteractionFacts: boolean;
  readonly includeRelationshipGraph: boolean;
  readonly prepareFullDocumentImages: boolean;
  readonly readinessHardTimeoutMs: number;
  readonly maxTextPreviewChars: number;
  readonly maxElements: number;
  readonly maxDepth: number;
  readonly maxSnapshotBytes: number;
}

export const STANDARD_CAPTURE_LIMITS = Object.freeze({ maxElements: 750, maxDepth: 24 });
export const DEEP_DOM_CAPTURE_LIMITS = Object.freeze({ maxElements: 1_000, maxDepth: 40 });

export const DEFAULT_PREFERENCES: CollectorPreferences = {
  schemaVersion: 5,
  captureProfile: "STANDARD",
  captureIntent: "GENERAL_AUDIT",
  redactionMode: "STRICT",
  includeScreenshot: false,
  includeHiddenElements: false,
  includePath: false,
  includePageTitle: false,
  includeColors: false,
  includeTextPreview: false,
  includeTextShape: true,
  includeInteractionFacts: true,
  includeRelationshipGraph: true,
  prepareFullDocumentImages: false,
  readinessHardTimeoutMs: 1_500,
  maxTextPreviewChars: 160,
  maxElements: STANDARD_CAPTURE_LIMITS.maxElements,
  maxDepth: STANDARD_CAPTURE_LIMITS.maxDepth,
  maxSnapshotBytes: 12_000_000,
};

export interface BindingContext {
  readonly reference: SourceContextReference;
  readonly selected_document: BridgeDocumentRecord | null;
  readonly documents: readonly BridgeDocumentRecord[];
  readonly site_path_scope: string;
}

export interface CaptureJob {
  readonly id: string;
  readonly requestId: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly tabId: number;
  readonly windowId: number;
  readonly documentUrl: string;
  readonly documentId: string | null;
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
  readonly observationIndex: number;
  readonly userLabel: string;
  readonly evidenceLabel: EvidenceLabel;
  readonly requestedProfileId: RequestedViewportProfile;
  readonly workflowMode: CaptureWorkflowMode;
  readonly expectedPageFingerprint: HashDigest | null;
  readonly expectedViewportWidth: number | null;
  readonly capturedAt: string;
  readonly bindingContext: BindingContext | null;
}

export interface ScreenshotRecord {
  readonly snapshotId: string;
  readonly sessionId: string;
  readonly mimeType: "image/png";
  readonly bytes: ArrayBuffer;
  readonly checksumSha256: string;
  readonly createdAt: string;
}

export interface PackageValidationData {
  readonly validation_state: ValidationState;
  readonly schema_validation: ValidationState;
  readonly canonical_json_validation: ValidationState;
  readonly checksum_validation: ValidationState;
  readonly referential_integrity: ValidationState;
  readonly identity_uniqueness_validation: ValidationState;
  readonly relationship_integrity: ValidationState;
  readonly source_binding_integrity: ValidationState;
  readonly package_manifest_validation: ValidationState;
  readonly identity_collision_count: number;
  readonly capture_completeness: "COMPLETE" | "PARTIAL";
  readonly partial_reasons: readonly string[];
  readonly validated_json_files: number;
  readonly canonical_json_files: number;
  readonly artifact_json_files: number;
  readonly embedded_schema_files: number;
  readonly schema_validated_artifact_paths: readonly string[];
  readonly schema_unvalidated_artifact_paths: readonly string[];
  readonly export_allowed: boolean;
}
