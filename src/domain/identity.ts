import type { ElementIdentity, IdentityConfidence, RedactionMode } from "./model";
import { sanitizeClassTokens, stableIdCandidate } from "./redaction";

export function nthOfType(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) index += 1;
    sibling = sibling.previousElementSibling;
  }
  return index;
}

export function stableDomReference(element: Element, maxSegments = 8): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && segments.length < maxSegments) {
    const tag = current.tagName.toLowerCase();
    const elementor = stableIdCandidate(current.getAttribute("data-elementor-id"));
    const dataId = stableIdCandidate(current.getAttribute("data-id"));
    const htmlId = stableIdCandidate(current.getAttribute("id"));
    if (elementor) {
      segments.unshift(`${tag}[data-elementor-id="${cssEscapeAttribute(elementor)}"]`);
      break;
    }
    if (dataId && hasElementorMarker(current)) {
      segments.unshift(`${tag}[data-id="${cssEscapeAttribute(dataId)}"]`);
      break;
    }
    if (htmlId) {
      segments.unshift(`${tag}#${cssEscapeIdentifier(htmlId)}`);
      break;
    }
    segments.unshift(`${tag}:nth-of-type(${nthOfType(current)})`);
    current = current.parentElement;
  }
  return segments.join(">");
}

export function buildElementIdentity(element: Element, mode: RedactionMode): ElementIdentity {
  const elementorId = stableIdCandidate(element.getAttribute("data-elementor-id"));
  const dataId = stableIdCandidate(element.getAttribute("data-id"));
  const htmlId = stableIdCandidate(element.getAttribute("id"));
  let strategy = "STABLE_DOM_REFERENCE";
  let confidence: IdentityConfidence = "PROBABLE";
  if (elementorId) {
    strategy = "ELEMENTOR_PAGE_ID";
    confidence = "EXACT";
  } else if (dataId && hasElementorMarker(element)) {
    strategy = "ELEMENTOR_ELEMENT_ID";
    confidence = "STRONG";
  } else if (htmlId) {
    strategy = "STABLE_HTML_ID";
    confidence = "STRONG";
  } else if (!element.parentElement) {
    confidence = "WEAK";
  }
  return {
    elementor_id: elementorId,
    data_id: dataId,
    tag_name: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    class_tokens: sanitizeClassTokens([...element.classList], mode),
    stable_dom_reference: stableDomReference(element),
    parent_reference: element.parentElement ? stableDomReference(element.parentElement) : null,
    sibling_index: nthOfType(element) - 1,
    identity_strategy: strategy,
    identity_confidence: confidence,
  };
}

export function hasElementorMarker(element: Element): boolean {
  return [...element.classList].some(
    (token) => token.startsWith("elementor-") || token.startsWith("e-"),
  );
}

function cssEscapeIdentifier(value: string): string {
  return value.replace(
    /[^A-Za-z0-9_-]/g,
    (char) => `\\${char.codePointAt(0)?.toString(16) ?? "0"} `,
  );
}

function cssEscapeAttribute(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
