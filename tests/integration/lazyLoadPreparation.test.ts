// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareFullDocumentImages } from "../../src/content/readiness/lazyLoadPreparation";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded lazy-load preparation", () => {
  it("uses a fixed bounded sweep and restores the initial scroll position", async () => {
    vi.useFakeTimers();
    let scrollX = 0;
    let scrollY = 120;
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => scrollX });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 4_200,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0);
    });
    vi.spyOn(window, "scrollTo").mockImplementation(
      (options?: ScrollToOptions | number, y?: number) => {
        if (typeof options === "number") {
          scrollX = options;
          scrollY = y ?? 0;
        } else {
          scrollX = options?.left ?? scrollX;
          scrollY = options?.top ?? scrollY;
        }
      },
    );

    const pending = prepareFullDocumentImages();
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.scroll_steps).toBeGreaterThan(0);
    expect(result.scroll_steps).toBeLessThanOrEqual(12);
    expect(result.initial_scroll_y).toBe(120);
    expect(result.restored_scroll_y).toBe(120);
    expect(result.completed).toBe(true);
  });
});
