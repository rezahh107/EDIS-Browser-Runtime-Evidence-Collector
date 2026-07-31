import { classifyWordPressAdminBar } from "../../domain/adminBar";
import { canonicalJsonWithoutFinalNewline } from "../../domain/canonical";
import { computeSkippedElementorElements } from "../../domain/elementorMetrics";
import { normalizeFiniteNumber } from "../../domain/geometry";
import type {
  AdminBarEvidence,
  BindingContext,
  CaptureEnvironmentEvidence,
  CaptureReadiness,
  CaptureStateEvidence,
  DocumentMetrics,
  PageBindingEvidence,
  PageEvidence,
  RedactionMode,
  RuntimeEnvironment,
  ViewportDescriptor,
} from "../../domain/model";
import { normalizeUrl, sanitizeClassTokens } from "../../domain/redaction";
import { stableDomReference } from "../../domain/identity";
import { sha256Digest } from "../../infrastructure/checksum";
import { computePageFingerprintEvidence } from "../../domain/pageFingerprint";
import { createCaptureMeasurementContext } from "../measurements/context";
import { isEffectivelyVisibleInViewport } from "../measurements/visibility";

export function collectRuntimeEnvironment(): RuntimeEnvironment {
  const browser = parseBrowser();
  return {
    browser_family: browser.family,
    browser_version: browser.version,
    platform_category: platformCategory(),
  };
}

export async function collectPageEvidence(
  includePath: boolean,
  includeTitle: boolean,
  redactionMode: RedactionMode,
  environment: RuntimeEnvironment,
  bindingContext: BindingContext | null,
): Promise<PageEvidence> {
  const normalizedLegacy = normalizeUrl(location.href, includePath);
  const root = document.documentElement;
  const classes = sanitizeClassTokens(
    [...root.classList].filter((token) => token.startsWith("elementor-") || token.startsWith("e-")),
    redactionMode,
  );
  const pageMarker = pageMarkerPresent();
  const fingerprintEvidence = await computePageFingerprintEvidence({
    rawUrl: location.href,
    pageMarkerPresent: pageMarker,
    rawDataElementorIds: [...document.querySelectorAll("[data-elementor-id]")].map(
      (element) => element.getAttribute("data-elementor-id") ?? "",
    ),
    bindingContext,
  });
  const rawPageIds = fingerprintEvidence.raw_data_elementor_ids;
  const selectedDocumentId = bindingContext?.selected_document?.document_id ?? null;
  const interpretedPageId =
    selectedDocumentId && rawPageIds.includes(selectedDocumentId) ? selectedDocumentId : null;
  const pageBindingEvidence = buildPageBindingEvidence(
    bindingContext,
    fingerprintEvidence.page_locator_sha256,
    rawPageIds,
    interpretedPageId,
  );
  const pageFingerprint = fingerprintEvidence.page_fingerprint;
  const pageContextId = await sha256Digest(
    canonicalJsonWithoutFinalNewline({
      page_fingerprint: pageFingerprint,
      selected_document_fingerprint:
        bindingContext?.selected_document?.document_fingerprint ?? null,
      site_fingerprint: bindingContext?.reference.site_fingerprint ?? null,
    }),
  );
  return {
    page_context_id: pageContextId,
    origin: normalizedLegacy.origin,
    path: normalizedLegacy.path,
    title: includeTitle ? sanitizeTitle(document.title) : null,
    document_language: root.lang || "",
    document_direction: document.dir || getComputedStyle(root).direction || "ltr",
    ready_state: document.readyState,
    visibility_state: document.visibilityState,
    browser_family: environment.browser_family,
    browser_version: environment.browser_version,
    platform_category: environment.platform_category,
    locator_facts: includePath ? fingerprintEvidence.locator_facts : null,
    locator_disclosure: includePath ? "RAW" : "HASH_ONLY",
    page_locator_sha256: fingerprintEvidence.page_locator_sha256,
    page_fingerprint: pageFingerprint,
    elementor: {
      page_marker_present: pageMarker,
      frontend_class_markers: classes.slice(0, 20),
      raw_data_elementor_ids: rawPageIds,
      page_elementor_document_id: interpretedPageId,
    },
    imported_site_fingerprint: bindingContext?.reference.site_fingerprint ?? null,
    page_binding_evidence: pageBindingEvidence,
    source_documents_present: [],
  };
}

function buildPageBindingEvidence(
  bindingContext: BindingContext | null,
  locatorHash: PageEvidence["page_locator_sha256"],
  rawPageIds: readonly string[],
  interpretedPageId: string | null,
): PageBindingEvidence {
  if (!bindingContext) {
    return {
      availability: "INSUFFICIENT",
      binding_state: "UNMATCHED",
      source_document_id: null,
      source_document_fingerprint: null,
      page_locator_candidate_match: false,
      page_elementor_document_id: null,
      confirmation_state: "NOT_CONFIRMED",
      reason_codes: ["SOURCE_CONTEXT_NOT_IMPORTED"],
    };
  }
  const selected = bindingContext.selected_document;
  if (!selected) {
    return {
      availability: "INSUFFICIENT",
      binding_state: "UNMATCHED",
      source_document_id: null,
      source_document_fingerprint: null,
      page_locator_candidate_match: false,
      page_elementor_document_id: null,
      confirmation_state: bindingContext.reference.confirmation_state,
      reason_codes: ["SOURCE_DOCUMENT_NOT_SELECTED"],
    };
  }
  const locatorMatch = selected.page_locator_candidates.includes(locatorHash);
  const markerConflict = rawPageIds.length > 0 && interpretedPageId === null;
  const reasonCodes: string[] = [];
  let state: PageBindingEvidence["binding_state"] = "UNMATCHED";
  if (markerConflict) {
    state = "AMBIGUOUS";
    reasonCodes.push("DOCUMENT_MISMATCH");
  } else if (interpretedPageId !== null && locatorMatch) {
    state = "EXACT";
  } else if (
    interpretedPageId !== null ||
    locatorMatch ||
    bindingContext.reference.confirmation_state === "CONFIRMED"
  ) {
    state = "PROBABLE";
    if (interpretedPageId === null) reasonCodes.push("PAGE_DOCUMENT_MARKER_NOT_OBSERVED");
    if (!locatorMatch) reasonCodes.push("PAGE_LOCATOR_NOT_MATCHED");
  } else {
    reasonCodes.push("NO_COMPATIBLE_DOCUMENT_MATCH_EVIDENCE");
  }
  return {
    availability: "AVAILABLE",
    binding_state: state,
    source_document_id: selected.document_id,
    source_document_fingerprint: selected.document_fingerprint,
    page_locator_candidate_match: locatorMatch,
    page_elementor_document_id: interpretedPageId,
    confirmation_state: bindingContext.reference.confirmation_state,
    reason_codes: reasonCodes,
  };
}

export function collectViewport(
  userLabel: string,
  evidenceLabel: ViewportDescriptor["evidence_label"],
  requestedProfileId: ViewportDescriptor["requested_profile_id"],
): ViewportDescriptor {
  const visual = window.visualViewport;
  return {
    inner_width: finite(window.innerWidth),
    inner_height: finite(window.innerHeight),
    outer_width: finite(window.outerWidth),
    outer_height: finite(window.outerHeight),
    device_pixel_ratio: finite(window.devicePixelRatio),
    visual_viewport: visual
      ? {
          width: finite(visual.width),
          height: finite(visual.height),
          scale: finite(visual.scale),
          offset_left: finite(visual.offsetLeft),
          offset_top: finite(visual.offsetTop),
        }
      : null,
    orientation: screen.orientation?.type ?? null,
    horizontal_scrollbar:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical_scrollbar:
      document.documentElement.scrollHeight > document.documentElement.clientHeight,
    zoom_evidence_status:
      visual && Math.abs(visual.scale - 1) > 0.001 ? "VISUAL_VIEWPORT_SCALE_OBSERVED" : "UNKNOWN",
    user_label: userLabel,
    evidence_label: evidenceLabel,
    requested_profile_id: requestedProfileId,
  };
}

export function collectDocumentMetrics(
  scannedNodes: number,
  maximumDepth: number,
  emittedElements: number,
  truncatedBranchCount: number,
  discovered: Readonly<{
    elementorElements: number;
    interactiveCandidates: number;
    fixedElements: number;
    stickyElements: number;
  }>,
  emitted: Readonly<{
    elementorElements: number;
    interactiveCandidates: number;
    fixedElements: number;
    stickyElements: number;
  }>,
  skippedHiddenSubtreeCount: number,
  skippedHiddenDirectChildCount: number,
): DocumentMetrics {
  const root = document.documentElement;
  const body = document.body;
  return {
    document_scroll_width: finite(root.scrollWidth),
    document_scroll_height: finite(root.scrollHeight),
    document_client_width: finite(root.clientWidth),
    document_client_height: finite(root.clientHeight),
    body_scroll_width: body ? finite(body.scrollWidth) : null,
    body_scroll_height: body ? finite(body.scrollHeight) : null,
    horizontal_page_overflow: root.scrollWidth > root.clientWidth + 1,
    vertical_scroll_exists: root.scrollHeight > root.clientHeight + 1,
    total_elementor_elements: discovered.elementorElements,
    total_interactive_elements: discovered.interactiveCandidates,
    discovered_elementor_elements: discovered.elementorElements,
    emitted_elementor_elements: emitted.elementorElements,
    skipped_elementor_elements: computeSkippedElementorElements(
      discovered.elementorElements,
      emitted.elementorElements,
    ),
    discovered_interactive_candidates: discovered.interactiveCandidates,
    emitted_interactive_candidates: emitted.interactiveCandidates,
    discovered_fixed_elements: discovered.fixedElements,
    emitted_fixed_elements: emitted.fixedElements,
    discovered_sticky_elements: discovered.stickyElements,
    emitted_sticky_elements: emitted.stickyElements,
    scanned_dom_nodes: scannedNodes,
    emitted_elements: emittedElements,
    maximum_measured_depth: maximumDepth,
    truncated_branch_count: truncatedBranchCount,
    fixed_elements: discovered.fixedElements,
    sticky_elements: discovered.stickyElements,
    skipped_hidden_subtree_count: skippedHiddenSubtreeCount,
    skipped_hidden_direct_child_count: skippedHiddenDirectChildCount,
  };
}

export async function collectCaptureState(
  readiness: CaptureReadiness,
  emittedStickyCandidates: number,
): Promise<CaptureStateEvidence> {
  const active = document.activeElement;
  let activeElementReferenceSha256: CaptureStateEvidence["active_element_reference_sha256"] = null;
  if (active && active !== document.body && active !== document.documentElement) {
    try {
      activeElementReferenceSha256 = await sha256Digest(stableDomReference(active));
    } catch {
      activeElementReferenceSha256 = null;
    }
  }
  return {
    scroll_x: finite(window.scrollX),
    scroll_y: finite(window.scrollY),
    document_visibility_state: document.visibilityState,
    document_prerendering:
      "prerendering" in document &&
      (document as Document & { readonly prerendering?: boolean }).prerendering === true,
    document_has_focus: document.hasFocus(),
    active_element_reference_sha256: activeElementReferenceSha256,
    prefers_reduced_motion: safeMediaMatch("(prefers-reduced-motion: reduce)"),
    pointer_capability: safeMediaMatch("(pointer: fine)")
      ? "FINE"
      : safeMediaMatch("(pointer: coarse)")
        ? "COARSE"
        : safeMediaMatch("(pointer: none)")
          ? "NONE"
          : "UNKNOWN",
    hover_capability: safeMediaMatch("(hover: hover)")
      ? "HOVER"
      : safeMediaMatch("(hover: none)")
        ? "NONE"
        : "UNKNOWN",
    animation_count: readiness.active_animation_count,
    sticky_candidate_count: emittedStickyCandidates,
    capture_trigger: "USER_INITIATED",
  };
}

export function collectCaptureEnvironment(readiness: CaptureReadiness): CaptureEnvironmentEvidence {
  const adminBar = collectAdminBarEvidence();
  const wordpressAdminBarPresent = adminBar.detection_state !== "ABSENT";
  const elementorEditorPreviewPresent =
    document.documentElement.classList.contains("elementor-html") &&
    (document.body.classList.contains("elementor-editor-active") ||
      document.querySelector(".elementor-editor-active, #elementor-preview") !== null);
  const iframeCapture = window.top !== window.self;
  const documentNotFocused = !document.hasFocus();
  const pageNotAtTop = Math.abs(window.scrollY) > 1 || Math.abs(window.scrollX) > 1;
  const measurementContext = createCaptureMeasurementContext(document);
  const visibleInEnvironment = (element: Element): boolean =>
    isEffectivelyVisibleInViewport(element, measurementContext);
  const openHtmlDialogCount = [...document.querySelectorAll("dialog[open]")].filter(
    visibleInEnvironment,
  ).length;
  const ariaModalTrueCount = [...document.querySelectorAll('[aria-modal="true"]')].filter(
    visibleInEnvironment,
  ).length;
  const visibleModalCount = [...new Set([
    ...document.querySelectorAll("dialog[open]"),
    ...document.querySelectorAll('[aria-modal="true"]'),
    ...document.querySelectorAll('[role="dialog"]'),
  ])].filter(visibleInEnvironment).length;
  const warningCodes = [
    wordpressAdminBarPresent ? "WORDPRESS_ADMIN_BAR_PRESENT" : null,
    elementorEditorPreviewPresent ? "ELEMENTOR_EDITOR_PREVIEW_PRESENT" : null,
    iframeCapture ? "IFRAME_CAPTURE" : null,
    documentNotFocused ? "DOCUMENT_NOT_FOCUSED" : null,
    pageNotAtTop ? "PAGE_NOT_AT_TOP" : null,
    openHtmlDialogCount > 0 || ariaModalTrueCount > 0 ? "SEMANTIC_DIALOG_EVIDENCE_PRESENT" : null,
    readiness.active_animation_count > 0 ? "ACTIVE_ANIMATIONS_PRESENT" : null,
    readiness.incomplete_image_count_in_viewport > 0 ? "IMAGES_IN_VIEWPORT_INCOMPLETE" : null,
  ].filter((value): value is string => value !== null);
  return {
    wordpress_admin_bar_present: wordpressAdminBarPresent,
    admin_bar: adminBar,
    elementor_editor_preview_present: elementorEditorPreviewPresent,
    iframe_capture: iframeCapture,
    document_not_focused: documentNotFocused,
    page_not_at_top: pageNotAtTop,
    open_html_dialog_count: openHtmlDialogCount,
    aria_modal_true_count: ariaModalTrueCount,
    body_pointer_events: document.body ? getComputedStyle(document.body).pointerEvents : null,
    visible_modal_count: visibleModalCount,
    active_animations_present: readiness.active_animation_count > 0,
    incomplete_images_in_viewport: readiness.incomplete_image_count_in_viewport,
    viewport_image_readiness: readiness.viewport_image_readiness,
    warning_codes: [...new Set(warningCodes)].sort(),
  };
}

function collectAdminBarEvidence(): AdminBarEvidence {
  const body = document.body;
  const element = document.getElementById("wpadminbar");
  const style = element ? getComputedStyle(element) : null;
  const rect = element?.getBoundingClientRect() ?? null;
  const htmlStyle = getComputedStyle(document.documentElement);
  const bodyStyle = body ? getComputedStyle(body) : null;
  const bodyClass = body?.classList.contains("admin-bar") ?? false;
  const visible = Boolean(
    element &&
    style &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    rect &&
    rect.height > 0,
  );
  const geometryAffected =
    Math.abs(parseCssNumber(htmlStyle.marginTop)) > 0.5 ||
    Math.abs(parseCssNumber(bodyStyle?.marginTop ?? "0")) > 0.5;
  const detectionState: AdminBarEvidence["detection_state"] = classifyWordPressAdminBar({
    bodyAdminBarClass: bodyClass,
    wpadminbarElementPresent: element !== null,
    wpadminbarVisible: visible,
    geometryAffected,
  });
  return {
    body_admin_bar_class: bodyClass,
    wpadminbar_element_present: element !== null,
    wpadminbar_computed_display: style?.display ?? null,
    wpadminbar_computed_visibility: style?.visibility ?? null,
    wpadminbar_rect_height: rect ? finite(rect.height) : null,
    html_computed_margin_top: htmlStyle.marginTop,
    body_computed_margin_top: bodyStyle?.marginTop ?? null,
    detection_state: detectionState,
  };
}

function parseCssNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeMediaMatch(query: string): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite page geometry.");
  return normalizeFiniteNumber(value);
}
function sanitizeTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, 300);
}
function pageMarkerPresent(): boolean {
  return (
    document.documentElement.classList.contains("elementor-html") ||
    document.body?.classList.contains("elementor-page") ||
    document.querySelector("[data-elementor-id]") !== null
  );
}
function parseBrowser(): { family: string; version: string | null } {
  const nav = navigator as Navigator & {
    readonly userAgentData?: {
      readonly brands: readonly { readonly brand: string; readonly version: string }[];
    };
  };
  for (const [family, pattern] of [
    ["Edge", /Microsoft Edge/i],
    ["Chrome", /Google Chrome/i],
    ["Chromium", /Chromium/i],
  ] as const) {
    const found = (nav.userAgentData?.brands ?? []).find((brand) => pattern.test(brand.brand));
    if (found) return { family, version: found.version || null };
  }
  for (const [family, pattern] of [
    ["Edge", /Edg\/([0-9.]+)/],
    ["Chrome", /Chrome\/([0-9.]+)/],
    ["Firefox", /Firefox\/([0-9.]+)/],
    ["Safari", /Version\/([0-9.]+).*Safari/],
  ] as const) {
    const match = pattern.exec(navigator.userAgent);
    if (match?.[1]) return { family, version: match[1] };
  }
  return { family: "Unknown", version: null };
}
function platformCategory(): RuntimeEnvironment["platform_category"] {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad/.test(ua)) return "TABLET";
  if (/mobile|android|iphone/.test(ua)) return "MOBILE";
  if (/windows|macintosh|linux|cros/.test(ua)) return "DESKTOP";
  return "UNKNOWN";
}
