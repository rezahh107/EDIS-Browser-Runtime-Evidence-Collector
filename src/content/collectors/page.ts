import type { DocumentMetrics, PageEvidence, ViewportDescriptor } from "../../domain/model";
import { normalizeUrl } from "../../domain/redaction";

export function collectPageEvidence(includePath: boolean, includeTitle: boolean): PageEvidence {
  const normalized = normalizeUrl(location.href, includePath);
  const parsedBrowser = parseBrowser(navigator.userAgent);
  const root = document.documentElement;
  const classes = [...root.classList]
    .filter((token) => token.startsWith("elementor-") || token.startsWith("e-"))
    .sort();
  return {
    origin: normalized.origin,
    path: normalized.path,
    title: includeTitle ? document.title.slice(0, 300) : null,
    document_language: root.lang || "",
    document_direction: document.dir || getComputedStyle(root).direction || "ltr",
    ready_state: document.readyState,
    visibility_state: document.visibilityState,
    browser_family: parsedBrowser.family,
    browser_version: parsedBrowser.version,
    platform_category: platformCategory(),
    elementor: {
      page_marker_present:
        root.classList.contains("elementor-html") ||
        document.body.classList.contains("elementor-page") ||
        document.querySelector("[data-elementor-id]") !== null,
      frontend_class_markers: classes.slice(0, 20),
      data_elementor_id:
        document.querySelector("[data-elementor-id]")?.getAttribute("data-elementor-id") ?? null,
    },
    site_fingerprint: null,
  };
}

export function collectViewport(
  userLabel: string,
  evidenceLabel: ViewportDescriptor["evidence_label"],
  officialBreakpointId: string | null,
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
    official_breakpoint_id: officialBreakpointId,
  };
}

export function collectDocumentMetrics(
  scannedNodes: number,
  maximumDepth: number,
): DocumentMetrics {
  const root = document.documentElement;
  const body = document.body;
  let elementor = 0;
  let interactive = 0;
  let fixed = 0;
  let sticky = 0;
  const bounded = [
    ...document.querySelectorAll(
      "[data-elementor-id], [data-id], a[href], button, input, select, textarea, summary, [role=button], [role=link], [style]",
    ),
  ].slice(0, 20_000);
  for (const element of bounded) {
    if (
      element.hasAttribute("data-elementor-id") ||
      (element.hasAttribute("data-id") &&
        [...element.classList].some(
          (token) => token.startsWith("elementor-") || token.startsWith("e-"),
        ))
    )
      elementor += 1;
    if (
      element.matches(
        "a[href], button, input, select, textarea, summary, [role=button], [role=link], [tabindex]",
      )
    )
      interactive += 1;
    const position = getComputedStyle(element).position;
    if (position === "fixed") fixed += 1;
    if (position === "sticky") sticky += 1;
  }
  return {
    document_scroll_width: finite(root.scrollWidth),
    document_scroll_height: finite(root.scrollHeight),
    document_client_width: finite(root.clientWidth),
    document_client_height: finite(root.clientHeight),
    body_scroll_width: body ? finite(body.scrollWidth) : null,
    body_scroll_height: body ? finite(body.scrollHeight) : null,
    horizontal_page_overflow: root.scrollWidth > root.clientWidth + 1,
    vertical_scroll_exists: root.scrollHeight > root.clientHeight + 1,
    total_elementor_elements: elementor,
    total_interactive_elements: interactive,
    scanned_dom_nodes: scannedNodes,
    maximum_measured_depth: maximumDepth,
    fixed_elements: fixed,
    sticky_elements: sticky,
  };
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite page geometry.");
  return Object.is(value, -0) ? 0 : value;
}

function parseBrowser(userAgent: string): { family: string; version: string | null } {
  const patterns: readonly [string, RegExp][] = [
    ["Edge", /Edg\/([0-9.]+)/],
    ["Chrome", /Chrome\/([0-9.]+)/],
    ["Firefox", /Firefox\/([0-9.]+)/],
    ["Safari", /Version\/([0-9.]+).*Safari/],
  ];
  for (const [family, pattern] of patterns) {
    const match = pattern.exec(userAgent);
    if (match?.[1]) return { family, version: match[1] };
  }
  return { family: "Unknown", version: null };
}

function platformCategory(): PageEvidence["platform_category"] {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad/.test(ua)) return "TABLET";
  if (/mobile|android|iphone/.test(ua)) return "MOBILE";
  if (/windows|macintosh|linux|cros/.test(ua)) return "DESKTOP";
  return "UNKNOWN";
}
