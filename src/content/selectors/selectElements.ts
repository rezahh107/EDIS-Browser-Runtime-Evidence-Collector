import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { stableDomReference } from "../../domain/identity";

export interface SelectionResult {
  readonly elements: readonly Element[];
  readonly scannedNodes: number;
  readonly maximumDepth: number;
  readonly diagnostics: readonly Diagnostic[];
}

interface Candidate {
  readonly element: Element;
  readonly score: number;
  readonly reference: string;
}

export function selectElements(
  maxElements: number,
  maxDepth: number,
  includeHidden: boolean,
): SelectionResult {
  const root = document.documentElement;
  const queue: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }];
  const candidates: Candidate[] = [];
  const diagnostics: Diagnostic[] = [];
  const scanBudget = Math.min(20_000, Math.max(maxElements, maxElements * 20));
  let scannedNodes = 0;
  let maximumDepth = 0;
  let depthLimited = false;

  while (queue.length > 0 && scannedNodes < scanBudget) {
    const current = queue.shift();
    if (!current) break;
    const { element, depth } = current;
    scannedNodes += 1;
    maximumDepth = Math.max(maximumDepth, depth);
    if (element.isConnected) {
      const style = getComputedStyle(element);
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0;
      if (includeHidden || visible) {
        const score = selectionScore(element, style);
        if (score > 0) candidates.push({ element, score, reference: stableDomReference(element) });
      }
    }
    if (depth >= maxDepth) {
      if (element.children.length > 0) depthLimited = true;
      continue;
    }
    for (const child of element.children) queue.push({ element: child, depth: depth + 1 });
  }

  if (queue.length > 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SCAN_LIMIT_REACHED",
        "WARNING",
        "DOM scanning stopped at the configured bounded scan budget.",
        true,
        { limit: scanBudget, scanned: scannedNodes },
      ),
    );
  }
  if (depthLimited) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_DEPTH_LIMIT_REACHED",
        "WARNING",
        "DOM traversal reached the configured maximum depth.",
        true,
        { limit: maxDepth, measured: maximumDepth },
      ),
    );
  }

  candidates.sort((a, b) => b.score - a.score || a.reference.localeCompare(b.reference, "en"));
  if (candidates.length > maxElements) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED",
        "WARNING",
        "Capture stopped at the configured element limit.",
        true,
        { limit: maxElements, matched: candidates.length },
      ),
    );
  }
  const selected = candidates
    .slice(0, maxElements)
    .sort((a, b) => a.reference.localeCompare(b.reference, "en"))
    .map((candidate) => candidate.element);
  return { elements: selected, scannedNodes, maximumDepth, diagnostics };
}

function selectionScore(element: Element, style: CSSStyleDeclaration): number {
  let score = 0;
  if (element.hasAttribute("data-elementor-id")) score += 100;
  if (element.hasAttribute("data-id") && hasElementorClass(element)) score += 90;
  if (hasElementorClass(element)) score += 60;
  if (
    element.matches(
      "a[href], button, input, select, textarea, summary, [role=button], [role=link], [tabindex]",
    )
  )
    score += 50;
  if (
    element.matches(
      "h1, h2, h3, h4, h5, h6, p, li, img, picture, video, nav, main, section, article, header, footer, form",
    )
  )
    score += 35;
  if (["grid", "flex", "inline-flex", "inline-grid"].includes(style.display)) score += 30;
  if (["fixed", "sticky", "absolute"].includes(style.position)) score += 40;
  if (
    element.scrollWidth > element.clientWidth + 1 ||
    element.scrollHeight > element.clientHeight + 1
  )
    score += 45;
  if (element === document.documentElement || element === document.body) score += 80;
  return score;
}

function hasElementorClass(element: Element): boolean {
  return [...element.classList].some(
    (token) => token.startsWith("elementor-") || token.startsWith("e-"),
  );
}
