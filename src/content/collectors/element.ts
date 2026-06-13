import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { buildElementIdentity } from "../../domain/identity";
import type { CaptureConfiguration, ElementMeasurement } from "../../domain/model";
import { collectComputedStyles } from "../measurements/styles";
import { collectTextEvidence } from "../measurements/text";
import { measureGeometry } from "../measurements/geometry";

export interface ElementCollectionResult {
  readonly measurements: readonly ElementMeasurement[];
  readonly diagnostics: readonly Diagnostic[];
}

export function collectElements(
  elements: readonly Element[],
  config: CaptureConfiguration,
): ElementCollectionResult {
  const measurements: ElementMeasurement[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const element of elements) {
    const geometry = measureGeometry(element);
    if (!geometry.ok) {
      diagnostics.push(
        diagnostic(
          geometry.error === "NON_FINITE"
            ? "EDIS_RUNTIME_NON_FINITE_GEOMETRY"
            : "EDIS_RUNTIME_PARTIAL_IDENTITY",
          "WARNING",
          geometry.error === "NON_FINITE"
            ? "An element with non-finite geometry was omitted."
            : "A detached element was omitted.",
          true,
          { tag: element.tagName.toLowerCase() },
        ),
      );
      continue;
    }
    const html = element instanceof HTMLElement ? element : null;
    const style = getComputedStyle(element);
    const interactive = element.matches(
      "a[href], button, input, select, textarea, summary, [role=button], [role=link], [tabindex]",
    );
    const disabled = html
      ? html.hasAttribute("disabled") || html.getAttribute("aria-disabled") === "true"
      : false;
    const tabIndex = html && html.hasAttribute("tabindex") ? html.tabIndex : null;
    const text = collectTextEvidence(
      element,
      config.includeTextPreview,
      config.maxTextPreviewLength,
      config.redactionMode,
    );
    measurements.push({
      identity: buildElementIdentity(element, config.redactionMode),
      bounding_rect: geometry.value.rect,
      document_coordinates: { x: geometry.value.documentX, y: geometry.value.documentY },
      client_width: finite(html?.clientWidth ?? Math.round(geometry.value.rect.width)),
      client_height: finite(html?.clientHeight ?? Math.round(geometry.value.rect.height)),
      scroll_width: finite(html?.scrollWidth ?? Math.round(geometry.value.rect.width)),
      scroll_height: finite(html?.scrollHeight ?? Math.round(geometry.value.rect.height)),
      offset_width: finite(html?.offsetWidth ?? Math.round(geometry.value.rect.width)),
      offset_height: finite(html?.offsetHeight ?? Math.round(geometry.value.rect.height)),
      viewport_intersection: geometry.value.intersection,
      area: geometry.value.area,
      horizontal_overflow: html ? html.scrollWidth > html.clientWidth + 1 : false,
      vertical_overflow: html ? html.scrollHeight > html.clientHeight + 1 : false,
      offscreen: geometry.value.offscreen,
      clipped: geometry.value.clipped,
      positioning: geometry.value.positioning,
      computed_styles: collectComputedStyles(element, config.includeColors),
      text,
      interaction: {
        interactive,
        disabled,
        tabindex: tabIndex,
        aria_label_present:
          element.hasAttribute("aria-label") &&
          (element.getAttribute("aria-label") ?? "").trim().length > 0,
        accessible_name_status: config.includeAccessibilityMetadata
          ? text.accessible_name_status
          : "NOT_APPLICABLE",
        hit_target_width: geometry.value.rect.width,
        hit_target_height: geometry.value.rect.height,
      },
    });
    if (style.position === "fixed" || style.position === "sticky") {
      // Position is already recorded as evidence; no conclusion is emitted here.
    }
  }
  return { measurements, diagnostics };
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite element dimension.");
  return Object.is(value, -0) ? 0 : value;
}
