// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewportImageReadinessSession } from "../../src/content/readiness/viewportImages";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe("viewport image readiness invalidation", () => {
  it("rechecks only the mutated image subtree instead of rescanning every image", async () => {
    const images: HTMLImageElement[] = [];
    for (let index = 0; index < 200; index += 1) {
      const image = document.createElement("img");
      image.alt = `image-${index}`;
      document.body.append(image);
      images.push(image);
    }
    const rect = {
      x: 0,
      y: 0,
      top: 0,
      right: 20,
      bottom: 20,
      left: 0,
      width: 20,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect;
    const geometry = vi
      .spyOn(HTMLImageElement.prototype, "getBoundingClientRect")
      .mockReturnValue(rect);
    const session = createViewportImageReadinessSession();
    try {
      await session.observe(0);
      const initialCalls = geometry.mock.calls.length;
      expect(initialCalls).toBe(200);

      const changedImage = images[100];
      expect(changedImage).toBeDefined();
      if (!changedImage) throw new Error("Expected the 101st image fixture.");
      changedImage.classList.add("changed");
      await new Promise((resolve) => setTimeout(resolve, 0));
      await session.observe(0);

      expect(geometry.mock.calls.length - initialCalls).toBeLessThanOrEqual(2);
    } finally {
      session.dispose();
    }
  });
});
