import { createIdentityContext, type IdentityContext } from "../../domain/identity";
import type { Result } from "../../domain/result";
import type { GeometryEvidence } from "./geometry";
import type { EffectiveVisibilityObservation } from "./visibility";

const ANCESTOR_MEASUREMENT_LIMIT = 128;
const CLIPPING_GEOMETRY_LIMIT = 6;

export interface AncestorMeasurementSummary {
  readonly nearestHidden: Element | null;
  readonly nearestPositioned: Element | null;
  readonly nearestScroll: Element | null;
  readonly nearestClipping: Element | null;
  readonly clippingAncestors: readonly Element[];
}

/** Runtime-only cache whose lifetime is bounded to one capture. */
export interface CaptureMeasurementContext {
  readonly document: Document;
  readonly identity: IdentityContext;
  readonly styles: WeakMap<Element, CSSStyleDeclaration>;
  readonly rects: WeakMap<Element, DOMRect>;
  readonly visibility: WeakMap<Element, EffectiveVisibilityObservation>;
  readonly geometry: WeakMap<Element, Result<GeometryEvidence, "DETACHED" | "NON_FINITE">>;
  readonly ancestors: WeakMap<Element, AncestorMeasurementSummary>;
}

export function createCaptureMeasurementContext(document: Document): CaptureMeasurementContext {
  return {
    document,
    identity: createIdentityContext(document),
    styles: new WeakMap<Element, CSSStyleDeclaration>(),
    rects: new WeakMap<Element, DOMRect>(),
    visibility: new WeakMap<Element, EffectiveVisibilityObservation>(),
    geometry: new WeakMap<Element, Result<GeometryEvidence, "DETACHED" | "NON_FINITE">>(),
    ancestors: new WeakMap<Element, AncestorMeasurementSummary>(),
  };
}

export function computedStyleFor(
  element: Element,
  context?: CaptureMeasurementContext,
): CSSStyleDeclaration {
  if (!context || context.document !== element.ownerDocument) return getComputedStyle(element);
  const cached = context.styles.get(element);
  if (cached) return cached;
  const style = getComputedStyle(element);
  context.styles.set(element, style);
  return style;
}

export function boundingRectFor(element: Element, context?: CaptureMeasurementContext): DOMRect {
  if (!context || context.document !== element.ownerDocument)
    return element.getBoundingClientRect();
  const cached = context.rects.get(element);
  if (cached) return cached;
  const rect = element.getBoundingClientRect();
  context.rects.set(element, rect);
  return rect;
}

export function ancestorMeasurementsFor(
  element: Element,
  context?: CaptureMeasurementContext,
): AncestorMeasurementSummary {
  if (context && context.document === element.ownerDocument) {
    const cached = context.ancestors.get(element);
    if (cached) return cached;
  }

  let nearestHidden: Element | null = null;
  let nearestPositioned: Element | null = null;
  let nearestScroll: Element | null = null;
  let nearestClipping: Element | null = null;
  const clippingAncestors: Element[] = [];
  let current = element.parentElement;
  let searched = 0;

  while (current && searched < ANCESTOR_MEASUREMENT_LIMIT) {
    const style = computedStyleFor(current, context);
    if (nearestHidden === null && styleHidesElement(style)) nearestHidden = current;
    if (nearestPositioned === null && style.position !== "static") nearestPositioned = current;
    if (nearestScroll === null && isScrollContainer(style)) nearestScroll = current;
    if (isClippingContainer(style)) {
      nearestClipping ??= current;
      if (clippingAncestors.length < CLIPPING_GEOMETRY_LIMIT) clippingAncestors.push(current);
    }
    current = current.parentElement;
    searched += 1;
  }

  const summary: AncestorMeasurementSummary = {
    nearestHidden,
    nearestPositioned,
    nearestScroll,
    nearestClipping,
    clippingAncestors,
  };
  if (context && context.document === element.ownerDocument)
    context.ancestors.set(element, summary);
  return summary;
}

export function styleHidesElement(style: CSSStyleDeclaration): boolean {
  const opacity = Number.parseFloat(style.opacity);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.contentVisibility === "hidden" ||
    (Number.isFinite(opacity) && opacity <= 0)
  );
}

export function isScrollContainer(style: CSSStyleDeclaration): boolean {
  return [style.overflowX, style.overflowY].some((value) => ["auto", "scroll"].includes(value));
}

export function isClippingContainer(style: CSSStyleDeclaration): boolean {
  return [style.overflowX, style.overflowY].some((value) =>
    ["hidden", "clip", "scroll", "auto"].includes(value),
  );
}
