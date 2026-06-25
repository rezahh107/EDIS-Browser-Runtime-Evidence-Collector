import { stableIdCandidate } from "./redaction";

export type ElementorMarkerReason =
  | "DATA_ELEMENTOR_ID"
  | "DATA_ID_WITH_ELEMENTOR_CLASS"
  | "ELEMENTOR_CLASS";

export interface ElementorMarkerEvidence {
  readonly matched: boolean;
  readonly reasons: readonly ElementorMarkerReason[];
}

/**
 * Classifies only observable runtime markers. It does not establish source binding,
 * resolve Elementor ownership, or infer saved-source identity.
 */
export function classifyElementorMarker(element: Element): ElementorMarkerEvidence {
  const hasDataElementorId = stableIdCandidate(element.getAttribute("data-elementor-id")) !== null;
  const hasDataId = stableIdCandidate(element.getAttribute("data-id")) !== null;
  const hasClassMarker = hasElementorClassMarker(element);
  const reasons: ElementorMarkerReason[] = [];

  if (hasDataElementorId) reasons.push("DATA_ELEMENTOR_ID");
  if (hasDataId && hasClassMarker) reasons.push("DATA_ID_WITH_ELEMENTOR_CLASS");
  if (hasClassMarker) reasons.push("ELEMENTOR_CLASS");

  return {
    matched: hasDataElementorId || hasClassMarker,
    reasons,
  };
}

export function hasElementorClassMarker(element: Element): boolean {
  return [...element.classList].some(isElementorClassToken);
}

export function isElementorClassToken(token: string): boolean {
  return token.startsWith("elementor-") || token.startsWith("e-");
}
