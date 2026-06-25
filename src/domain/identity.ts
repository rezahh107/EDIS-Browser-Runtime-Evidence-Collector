import type {
  ElementIdentity,
  IdentityConfidence,
  IdentitySource,
  IdentityStatus,
  RedactionMode,
  RuntimeElementorMarkers,
} from "./model";
import { hasElementorClassMarker } from "./elementorMarker";
import { sanitizeClassTokens, stableIdCandidate } from "./redaction";

const IDENTITY_INDEX_LIMIT = 20_000;
const INDEXED_ATTRIBUTES = ["data-elementor-id", "data-id", "id", "data-testid"] as const;

type IndexedAttribute = (typeof INDEXED_ATTRIBUTES)[number];
type UnhashedIdentity = Omit<ElementIdentity, "reference_sha256">;

interface IdentityIndex {
  readonly complete: boolean;
  readonly values: ReadonlyMap<string, number>;
}

interface IdentityCandidate {
  readonly reference: string;
  readonly source: IdentitySource;
  readonly strategy: string;
  readonly confidence: IdentityConfidence;
  readonly status: IdentityStatus;
  readonly unique: boolean;
  readonly occurrenceCount: number;
}

export interface StructuralOrdinals {
  readonly siblingIndex: number;
  readonly nthOfType: number;
}

/** Capture-scoped runtime cache. It does not alter emitted evidence. */
export interface IdentityContext {
  readonly document: Document;
  readonly index: IdentityIndex;
  readonly candidates: WeakMap<Element, IdentityCandidate>;
  readonly references: WeakMap<Element, string>;
  readonly ordinals: WeakMap<Element, StructuralOrdinals>;
  readonly indexedParents: WeakSet<Element>;
}

export function createIdentityContext(document: Document): IdentityContext {
  return {
    document,
    index: buildIdentityIndex(document),
    candidates: new WeakMap<Element, IdentityCandidate>(),
    references: new WeakMap<Element, string>(),
    ordinals: new WeakMap<Element, StructuralOrdinals>(),
    indexedParents: new WeakSet<Element>(),
  };
}

export function structuralOrdinals(
  element: Element,
  context?: IdentityContext,
): StructuralOrdinals {
  const resolved = resolveContext(element.ownerDocument, context);
  const cached = resolved.ordinals.get(element);
  if (cached) return cached;

  const parent = element.parentElement;
  if (!parent) {
    const rootOrdinals = { siblingIndex: 0, nthOfType: 1 } satisfies StructuralOrdinals;
    resolved.ordinals.set(element, rootOrdinals);
    return rootOrdinals;
  }

  if (!resolved.indexedParents.has(parent)) {
    const counts = new Map<string, number>();
    let siblingIndex = 0;
    for (const child of parent.children) {
      const nextOfType = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, nextOfType);
      resolved.ordinals.set(child, { siblingIndex, nthOfType: nextOfType });
      siblingIndex += 1;
    }
    resolved.indexedParents.add(parent);
  }

  return resolved.ordinals.get(element) ?? fallbackStructuralOrdinals(element);
}

export function nthOfType(element: Element, context?: IdentityContext): number {
  if (context && context.document === element.ownerDocument)
    return structuralOrdinals(element, context).nthOfType;
  return fallbackStructuralOrdinals(element).nthOfType;
}

function fallbackStructuralOrdinals(element: Element): StructuralOrdinals {
  let index = 1;
  let siblingIndex = 0;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) index += 1;
    siblingIndex += 1;
    sibling = sibling.previousElementSibling;
  }
  return { siblingIndex, nthOfType: index };
}

export function stableDomReference(element: Element, context?: IdentityContext): string {
  const resolved = resolveContext(element.ownerDocument, context);
  const cached = resolved.references.get(element);
  if (cached !== undefined) return cached;
  const reference = structuralReference(element, resolved);
  resolved.references.set(element, reference);
  return reference;
}

export function buildElementIdentities(
  elements: readonly Element[],
  mode: RedactionMode,
  context?: IdentityContext,
): readonly UnhashedIdentity[] {
  const document = elements[0]?.ownerDocument ?? globalThis.document;
  const resolved = resolveContext(document, context);
  const candidates = elements.map((element) => resolveCandidate(element, resolved));
  const selectedCounts = countReferences(candidates.map((candidate) => candidate.reference));

  return elements.map((element, position) => {
    const candidate = candidates[position] ?? unmatchedCandidate(element);
    const selectedCollisionCount = selectedCounts.get(candidate.reference) ?? 1;
    const referenceOccurrenceCount = Math.max(candidate.occurrenceCount, selectedCollisionCount);
    const unique = candidate.unique && referenceOccurrenceCount === 1;
    const status: IdentityStatus =
      candidate.status === "UNMATCHED" ? "UNMATCHED" : unique ? "UNIQUE" : "AMBIGUOUS";
    const confidence: IdentityConfidence =
      status === "AMBIGUOUS" && candidate.confidence !== "UNMATCHED"
        ? "WEAK"
        : candidate.confidence;
    return {
      tag_name: element.tagName.toLowerCase(),
      role: sanitizeRole(element.getAttribute("role")),
      class_tokens: sanitizeClassTokens([...element.classList], mode),
      stable_dom_reference: candidate.reference,
      sibling_index: structuralOrdinals(element, resolved).siblingIndex,
      identity_source: status === "UNMATCHED" ? "UNMATCHED" : candidate.source,
      identity_strategy: candidate.strategy,
      identity_confidence: confidence,
      identity_status: status,
      unique_in_document: unique,
      reference_occurrence_count: status === "UNMATCHED" ? 0 : referenceOccurrenceCount,
      collision_count: status === "UNMATCHED" ? 0 : Math.max(0, referenceOccurrenceCount - 1),
    };
  });
}

export function buildElementIdentity(
  element: Element,
  mode: RedactionMode,
  context?: IdentityContext,
): UnhashedIdentity {
  const identity = buildElementIdentities([element], mode, context)[0];
  if (!identity) throw new Error("Element identity could not be constructed.");
  return identity;
}

export function runtimeElementorMarkers(element: Element): RuntimeElementorMarkers {
  const classTokens = [...element.classList];
  return {
    data_elementor_id: stableIdCandidate(element.getAttribute("data-elementor-id")),
    data_id: stableIdCandidate(element.getAttribute("data-id")),
    elementor_class_marker_present: hasElementorMarker(element),
    widget_class_markers: classTokens
      .filter((token) => /^elementor-widget-[A-Za-z0-9_-]{1,120}$/.test(token))
      .sort()
      .slice(0, 20),
    structure_class_markers: classTokens
      .filter((token) =>
        [
          "elementor-section",
          "elementor-inner-section",
          "elementor-container",
          "e-con",
          "e-con-inner",
          "e-grid",
          "e-flexbox",
          "e-div-block",
        ].includes(token),
      )
      .sort(),
  };
}

export function markerOccurrenceCount(
  document: Document,
  attribute: "data-elementor-id" | "data-id",
  value: string | null,
  context?: IdentityContext,
): number {
  if (!value) return 0;
  const resolved = resolveContext(document, context);
  return resolved.index.values.get(`${attribute}\u0000${value}`) ?? 0;
}

export function hasElementorMarker(element: Element): boolean {
  return hasElementorClassMarker(element);
}

function resolveContext(document: Document, context?: IdentityContext): IdentityContext {
  if (context && context.document === document) return context;
  return createIdentityContext(document);
}

function resolveCandidate(element: Element, context: IdentityContext): IdentityCandidate {
  const cached = context.candidates.get(element);
  if (cached) return cached;

  const candidates: Array<{
    value: string | null;
    source: IdentitySource;
    strategy: string;
    confidence: IdentityConfidence;
    reference: (value: string) => string;
  }> = [
    {
      value: uniqueStableCandidate(element, "id", context.index),
      source: "HTML_ID",
      strategy: "STABLE_HTML_ID",
      confidence: "STRONG",
      reference: (value) => `${element.tagName.toLowerCase()}#${cssEscapeIdentifier(value)}`,
    },
    {
      value: uniqueStableCandidate(element, "data-testid", context.index),
      source: "DATA_TEST_ID",
      strategy: "STABLE_DATA_TEST_ID",
      confidence: "STRONG",
      reference: (value) =>
        `${element.tagName.toLowerCase()}[data-testid="${cssEscapeAttribute(value)}"]`,
    },
  ];

  for (const item of candidates) {
    if (!item.value) continue;
    const candidate: IdentityCandidate = {
      reference: item.reference(item.value),
      source: item.source,
      strategy: item.strategy,
      confidence: item.confidence,
      status: "UNIQUE",
      unique: true,
      occurrenceCount: 1,
    };
    context.candidates.set(element, candidate);
    context.references.set(element, candidate.reference);
    return candidate;
  }

  const structural = stableDomReference(element, context);
  const connected = element.isConnected && element.ownerDocument.documentElement.contains(element);
  const isRoot = element === element.ownerDocument.documentElement;
  const candidate: IdentityCandidate = structural
    ? {
        reference: structural,
        source: "STRUCTURAL_PATH",
        strategy: isRoot ? "DOCUMENT_ROOT" : "STRUCTURAL_PATH",
        confidence: "PROBABLE",
        status: connected ? "UNIQUE" : "AMBIGUOUS",
        unique: connected,
        occurrenceCount: 1,
      }
    : unmatchedCandidate(element);
  context.candidates.set(element, candidate);
  return candidate;
}

function unmatchedCandidate(element: Element): IdentityCandidate {
  return {
    reference: `${element.tagName.toLowerCase()}:unmatched`,
    source: "UNMATCHED",
    strategy: "UNMATCHED",
    confidence: "UNMATCHED",
    status: "UNMATCHED",
    unique: false,
    occurrenceCount: 0,
  };
}

function structuralReference(element: Element, context: IdentityContext): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    const anchor = stableAnchor(current, context.index);
    if (anchor) {
      segments.unshift(anchor);
      break;
    }
    segments.unshift(`${tag}:nth-of-type(${nthOfType(current, context)})`);
    current = current.parentElement;
  }
  return segments.join(">");
}

function stableAnchor(element: Element, index: IdentityIndex): string | null {
  const tag = element.tagName.toLowerCase();
  const htmlId = uniqueStableCandidate(element, "id", index);
  if (htmlId) return `${tag}#${cssEscapeIdentifier(htmlId)}`;
  const testId = uniqueStableCandidate(element, "data-testid", index);
  return testId ? `${tag}[data-testid="${cssEscapeAttribute(testId)}"]` : null;
}

function uniqueStableCandidate(
  element: Element,
  attribute: IndexedAttribute,
  index: IdentityIndex,
): string | null {
  const value = stableIdCandidate(element.getAttribute(attribute));
  if (!value) return null;
  return index.complete && index.values.get(`${attribute}\u0000${value}`) === 1 ? value : null;
}

function buildIdentityIndex(document: Document): IdentityIndex {
  const all = document.getElementsByTagName("*");
  const complete = all.length <= IDENTITY_INDEX_LIMIT;
  const values = new Map<string, number>();
  const length = Math.min(all.length, IDENTITY_INDEX_LIMIT);
  for (let position = 0; position < length; position += 1) {
    const element = all.item(position);
    if (!element) continue;
    for (const attribute of INDEXED_ATTRIBUTES) {
      const value = stableIdCandidate(element.getAttribute(attribute));
      if (!value) continue;
      const key = `${attribute}\u0000${value}`;
      values.set(key, (values.get(key) ?? 0) + 1);
    }
  }
  return { complete, values };
}

function countReferences(references: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const reference of references) counts.set(reference, (counts.get(reference) ?? 0) + 1);
  return counts;
}

function sanitizeRole(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/.test(normalized) ? normalized : null;
}

function cssEscapeIdentifier(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const safe = /[A-Za-z0-9_-]/.test(char);
    const leadingDigit = index === 0 && /[0-9]/.test(char);
    output += safe && !leadingDigit ? char : `\\${char.codePointAt(0)?.toString(16) ?? "0"} `;
  }
  return output;
}

function cssEscapeAttribute(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
