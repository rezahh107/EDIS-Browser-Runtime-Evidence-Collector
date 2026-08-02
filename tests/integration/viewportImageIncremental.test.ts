// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewportImageReadinessSession } from "../../src/content/readiness/viewportImages";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe("viewport image readiness membership", () => {
  it("T09_IMAGE_MEMBERSHIP_LAYOUT_SHIFT: rescans every sample when geometry changes without DOM mutation", async () => {
    const first = document.createElement("img");
    const entering = document.createElement("img");
    document.body.append(first, entering);
    let enteringViewport = false;
    const inside = rect(0, 0, 20, 20);
    const outside = rect(0, 2_000, 20, 20);
    vi.spyOn(first, "getBoundingClientRect").mockImplementation(() => inside);
    const enteringGeometry = vi
      .spyOn(entering, "getBoundingClientRect")
      .mockImplementation(() => (enteringViewport ? inside : outside));

    const session = createViewportImageReadinessSession();
    try {
      const initial = await session.observe(0);
      expect(initial.candidate_count).toBe(1);

      enteringViewport = true;
      const final = await session.observe(0);
      expect(final.candidate_count).toBe(2);
      // Each observation performs an initial scan and an authoritative final scan.
      expect(enteringGeometry).toHaveBeenCalledTimes(4);
    } finally {
      session.dispose();
    }
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}
