import { normalizeRect, rectangleIntersection } from "../../domain/geometry";
import type { Rect, ViewportIntersection } from "../../domain/model";
import { err, ok, type Result } from "../../domain/result";

export interface GeometryEvidence {
  readonly rect: Rect;
  readonly documentX: number;
  readonly documentY: number;
  readonly intersection: ViewportIntersection;
  readonly area: number;
  readonly clipped: boolean;
  readonly offscreen: boolean;
  readonly positioning: "static" | "relative" | "absolute" | "fixed" | "sticky" | "other";
}

export function measureGeometry(
  element: Element,
): Result<GeometryEvidence, "DETACHED" | "NON_FINITE"> {
  if (!element.isConnected) return err("DETACHED");
  const source = element.getBoundingClientRect();
  const normalized = normalizeRect({
    x: source.x,
    y: source.y,
    top: source.top,
    right: source.right,
    bottom: source.bottom,
    left: source.left,
    width: source.width,
    height: source.height,
  });
  if (!normalized.ok) return err("NON_FINITE");
  const rect = normalized.value;
  const documentX = rect.x + window.scrollX;
  const documentY = rect.y + window.scrollY;
  if (![documentX, documentY].every(Number.isFinite)) return err("NON_FINITE");
  const intersection = rectangleIntersection(rect, window.innerWidth, window.innerHeight);
  const style = getComputedStyle(element);
  return ok({
    rect,
    documentX,
    documentY,
    intersection,
    area: Math.max(0, rect.width * rect.height),
    clipped: detectClipping(element, rect),
    offscreen: !intersection.intersects,
    positioning: normalizePosition(style.position),
  });
}

function detectClipping(element: Element, rect: Rect): boolean {
  let parent = element.parentElement;
  let checked = 0;
  while (parent && checked < 6) {
    const style = getComputedStyle(parent);
    if (
      ["hidden", "clip", "scroll", "auto"].includes(style.overflowX) ||
      ["hidden", "clip", "scroll", "auto"].includes(style.overflowY)
    ) {
      const parentRect = parent.getBoundingClientRect();
      if (
        rect.left < parentRect.left - 0.5 ||
        rect.right > parentRect.right + 0.5 ||
        rect.top < parentRect.top - 0.5 ||
        rect.bottom > parentRect.bottom + 0.5
      )
        return true;
    }
    parent = parent.parentElement;
    checked += 1;
  }
  return false;
}

function normalizePosition(value: string): GeometryEvidence["positioning"] {
  return ["static", "relative", "absolute", "fixed", "sticky"].includes(value)
    ? (value as GeometryEvidence["positioning"])
    : "other";
}
