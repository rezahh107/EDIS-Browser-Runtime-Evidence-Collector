import { describe, expect, it } from "vitest";
import { finiteNumber, normalizeRect, rectangleIntersection } from "../../src/domain/geometry";

describe("geometry normalization", () => {
  it("accepts finite values and normalizes negative zero", () => {
    const result = normalizeRect({
      x: -0,
      y: 2,
      top: 2,
      right: 12,
      bottom: 22,
      left: 2,
      width: 10,
      height: 20,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.is(result.value.x, -0)).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(finiteNumber(Number.NaN).ok).toBe(false);
    expect(finiteNumber(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it("calculates a bounded viewport intersection", () => {
    const result = rectangleIntersection(
      { x: -10, y: 0, top: 0, right: 10, bottom: 20, left: -10, width: 20, height: 20 },
      100,
      100,
    );
    expect(result.intersects).toBe(true);
    expect(result.ratio).toBe(0.5);
    expect(result.rect.width).toBe(10);
  });
});
