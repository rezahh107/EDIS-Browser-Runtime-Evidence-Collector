import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { classifyElementorMarker } from "../../domain/elementorMarker";
import { stableDomReference } from "../../domain/identity";
import { computedStyleFor, type CaptureMeasurementContext } from "../measurements/context";
import { inspectEffectiveVisibility } from "../measurements/visibility";

export interface SelectionMetrics {
  readonly elementorElements: number;
  readonly interactiveCandidates: number;
  readonly fixedElements: number;
  readonly stickyElements: number;
}

export interface SelectionResult {
  readonly elements: readonly Element[];
  readonly scannedNodes: number;
  readonly visitedElements: number;
  readonly maximumDepth: number;
  readonly truncatedBranchCount: number;
  readonly firstTruncatedReference: string | null;
  readonly skippedHiddenSubtreeCount: number;
  readonly skippedHiddenDirectChildCount: number;
  readonly scanBudget: number;
  readonly elementBudget: number;
  readonly metrics: SelectionMetrics;
  readonly diagnostics: readonly Diagnostic[];
}

const SKIPPED_SUBTREES = new Set([
  "base",
  "head",
  "link",
  "meta",
  "noscript",
  "script",
  "style",
  "template",
  "title",
]);

const INTERACTIVE_CANDIDATE_SELECTOR =
  "a[href], button, input, select, textarea, summary, [role=button], [role=link], [tabindex]";

export function selectElements(
  maxElements: number,
  maxDepth: number,
  includeHidden: boolean,
  context?: CaptureMeasurementContext,
): SelectionResult {
  const root = document.documentElement;
  const stack: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }];
  const selected: Element[] = [];
  const diagnostics: Diagnostic[] = [];
  const scanBudget = Math.min(20_000, Math.max(1_000, maxElements * 20));
  let scannedNodes = 0;
  let visitedElements = 0;
  let maximumDepth = 0;
  let truncatedBranchCount = 0;
  let firstTruncatedReference: string | null = null;
  let skippedHiddenSubtreeCount = 0;
  let skippedHiddenDirectChildCount = 0;
  let elementLimited = false;
  let elementorElements = 0;
  let interactiveCandidates = 0;
  let fixedElements = 0;
  let stickyElements = 0;

  while (stack.length > 0 && scannedNodes < scanBudget) {
    const current = stack.pop();
    if (!current) break;
    const { element, depth } = current;
    scannedNodes += 1;
    maximumDepth = Math.max(maximumDepth, depth);

    const tag = element.tagName.toLowerCase();
    const skipSubtree = SKIPPED_SUBTREES.has(tag);
    let pruneHiddenSubtree = false;
    if (!skipSubtree && element.isConnected) {
      visitedElements += 1;
      const style = computedStyleFor(element, context);
      const visibility = inspectEffectiveVisibility(element, context);
      const visible = visibility.effectiveVisible;
      if (selected.length < maxElements) {
        if (includeHidden || visible) selected.push(element);
      } else {
        elementLimited = true;
      }
      if (classifyElementorMarker(element).matched) elementorElements += 1;
      if (element.matches(INTERACTIVE_CANDIDATE_SELECTOR)) interactiveCandidates += 1;
      if (style.position === "fixed") fixedElements += 1;
      if (style.position === "sticky") stickyElements += 1;

      pruneHiddenSubtree = !includeHidden && !visible && element.children.length > 0;
      if (pruneHiddenSubtree) {
        skippedHiddenSubtreeCount += 1;
        skippedHiddenDirectChildCount += element.children.length;
      }
    }

    if (skipSubtree || pruneHiddenSubtree) continue;
    if (depth >= maxDepth) {
      if (element.children.length > 0) {
        truncatedBranchCount += 1;
        firstTruncatedReference ??= safeReference(element, context);
      }
      continue;
    }
    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      const child = element.children.item(index);
      if (child) stack.push({ element: child, depth: depth + 1 });
    }
  }

  if (stack.length > 0) {
    truncatedBranchCount += stack.length;
    firstTruncatedReference ??= safeReference(stack.at(-1)?.element ?? root, context);
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SCAN_LIMIT_REACHED",
        "WARNING",
        "DOM scanning stopped at the configured bounded scan budget.",
        true,
        {
          limit: scanBudget,
          scanned: scannedNodes,
          truncated_branches: truncatedBranchCount,
          first_truncated_reference: firstTruncatedReference,
        },
      ),
    );
  }
  if (truncatedBranchCount > 0 && maximumDepth >= maxDepth) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_DEPTH_LIMIT_REACHED",
        "WARNING",
        "DOM traversal reached the configured maximum depth.",
        true,
        {
          configured_limit: maxDepth,
          deepest_observed_depth: maximumDepth,
          truncated_branches: truncatedBranchCount,
          first_truncated_reference: firstTruncatedReference,
        },
      ),
    );
  }
  if (elementLimited) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED",
        "WARNING",
        "Element collection stopped at the configured element limit.",
        true,
        { limit: maxElements, selected: selected.length, scanned: scannedNodes },
      ),
    );
  }

  return {
    elements: selected,
    scannedNodes,
    visitedElements,
    maximumDepth,
    truncatedBranchCount,
    firstTruncatedReference,
    skippedHiddenSubtreeCount,
    skippedHiddenDirectChildCount,
    scanBudget,
    elementBudget: maxElements,
    metrics: { elementorElements, interactiveCandidates, fixedElements, stickyElements },
    diagnostics,
  };
}

export function isInteractiveCandidate(element: Element): boolean {
  return element.matches(INTERACTIVE_CANDIDATE_SELECTOR);
}

function safeReference(element: Element, context?: CaptureMeasurementContext): string | null {
  try {
    return stableDomReference(element, context?.identity).slice(0, 2_048);
  } catch {
    return null;
  }
}
