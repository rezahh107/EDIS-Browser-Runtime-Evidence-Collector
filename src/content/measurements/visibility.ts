import { stableDomReference } from "../../domain/identity";
import {
  ancestorMeasurementsFor,
  boundingRectFor,
  computedStyleFor,
  styleHidesElement,
  type CaptureMeasurementContext,
} from "./context";

export interface EffectiveVisibilityObservation {
  readonly directHidden: boolean;
  readonly hiddenByAncestor: boolean;
  readonly nearestHiddenAncestor: Element | null;
  readonly nearestHiddenAncestorReference: string | null;
  readonly effectiveVisible: boolean;
}

export function inspectEffectiveVisibility(
  element: Element,
  context?: CaptureMeasurementContext,
): EffectiveVisibilityObservation {
  if (context && context.document === element.ownerDocument) {
    const cached = context.visibility.get(element);
    if (cached) return cached;
  }

  const directHidden = styleHidesElement(computedStyleFor(element, context));
  const nearestHiddenAncestor = ancestorMeasurementsFor(element, context).nearestHidden;
  let nearestHiddenAncestorReference: string | null = null;
  if (nearestHiddenAncestor) {
    try {
      nearestHiddenAncestorReference = stableDomReference(
        nearestHiddenAncestor,
        context?.identity,
      ).slice(0, 8_192);
    } catch {
      nearestHiddenAncestorReference = null;
    }
  }

  const observation: EffectiveVisibilityObservation = {
    directHidden,
    hiddenByAncestor: nearestHiddenAncestor !== null,
    nearestHiddenAncestor,
    nearestHiddenAncestorReference,
    effectiveVisible: !directHidden && nearestHiddenAncestor === null,
  };
  if (context && context.document === element.ownerDocument)
    context.visibility.set(element, observation);
  return observation;
}

export function isEffectivelyVisibleInViewport(
  element: Element,
  context?: CaptureMeasurementContext,
): boolean {
  if (!inspectEffectiveVisibility(element, context).effectiveVisible) return false;
  const rect = boundingRectFor(element, context);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}
