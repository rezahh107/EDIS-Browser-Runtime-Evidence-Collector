import type { Rect, ViewportIntersection } from "./model";
import { err, ok, type Result } from "./result";

const GEOMETRY_DECIMALS = 6;

export function finiteNumber(value: unknown): Result<number, "NON_FINITE"> {
  return typeof value === "number" && Number.isFinite(value)
    ? ok(normalizeFiniteNumber(value))
    : err("NON_FINITE");
}

export function normalizeFiniteNumber(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite geometry value.");
  const factor = 10 ** GEOMETRY_DECIMALS;
  const normalized = Math.round(value * factor) / factor;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function normalizeRect(
  input: Readonly<Record<string, unknown>>,
): Result<Rect, "NON_FINITE"> {
  const keys = ["x", "y", "top", "right", "bottom", "left", "width", "height"] as const;
  const output: Record<string, number> = {};
  for (const key of keys) {
    const checked = finiteNumber(input[key]);
    if (!checked.ok) return checked;
    output[key] = checked.value;
  }
  return ok(output as unknown as Rect);
}

export function rectangleIntersection(
  rect: Rect,
  viewportWidth: number,
  viewportHeight: number,
): ViewportIntersection {
  const left = normalizeFiniteNumber(Math.max(0, rect.left));
  const top = normalizeFiniteNumber(Math.max(0, rect.top));
  const right = normalizeFiniteNumber(Math.min(viewportWidth, rect.right));
  const bottom = normalizeFiniteNumber(Math.min(viewportHeight, rect.bottom));
  const width = normalizeFiniteNumber(Math.max(0, right - left));
  const height = normalizeFiniteNumber(Math.max(0, bottom - top));
  const area = normalizeFiniteNumber(Math.max(0, rect.width * rect.height));
  const intersectionArea = normalizeFiniteNumber(width * height);
  return {
    intersects: width > 0 && height > 0,
    ratio: area === 0 ? 0 : normalizeFiniteNumber(Math.min(1, intersectionArea / area)),
    rect: { x: left, y: top, top, right, bottom, left, width, height },
  };
}

export function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
