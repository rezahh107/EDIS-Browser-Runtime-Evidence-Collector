import type { Rect, ViewportIntersection } from "./model";
import { err, ok, type Result } from "./result";

export function finiteNumber(value: unknown): Result<number, "NON_FINITE"> {
  return typeof value === "number" && Number.isFinite(value) ? ok(value) : err("NON_FINITE");
}

export function normalizeRect(
  input: Readonly<Record<string, unknown>>,
): Result<Rect, "NON_FINITE"> {
  const keys = ["x", "y", "top", "right", "bottom", "left", "width", "height"] as const;
  const output: Record<string, number> = {};
  for (const key of keys) {
    const checked = finiteNumber(input[key]);
    if (!checked.ok) return checked;
    output[key] = normalizeNegativeZero(checked.value);
  }
  return ok(output as unknown as Rect);
}

export function rectangleIntersection(
  rect: Rect,
  viewportWidth: number,
  viewportHeight: number,
): ViewportIntersection {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const area = Math.max(0, rect.width * rect.height);
  const intersectionArea = width * height;
  return {
    intersects: width > 0 && height > 0,
    ratio: area === 0 ? 0 : Math.min(1, intersectionArea / area),
    rect: { x: left, y: top, top, right, bottom, left, width, height },
  };
}

export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
