// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { observeCaptureReadiness } from "../../src/content/readiness/captureReadiness";

afterEach(() => {
  document.body.textContent = "";
});

describe("viewport-aware capture readiness", () => {
  it("does not let an incomplete offscreen lazy image block stable readiness", async () => {
    prepareDocument();
    const image = incompleteImage({ top: 2_000, bottom: 2_100 });
    document.body.append(image);

    const result = await observeCaptureReadiness(1_500);
    expect(result.process_state).toBe("STABLE");
    expect(result.incomplete_image_count_total).toBe(1);
    expect(result.incomplete_image_count_in_viewport).toBe(0);
    expect(result.timeout_reached).toBe(false);
  });

  it("ignores an incomplete image hidden by an ancestor", async () => {
    prepareDocument();
    const hidden = document.createElement("div");
    hidden.style.opacity = "0";
    const image = incompleteImage({ top: 10, bottom: 110 });
    hidden.append(image);
    document.body.append(hidden);

    const result = await observeCaptureReadiness(1_500);
    expect(result.process_state).toBe("STABLE");
    expect(result.incomplete_image_count_total).toBe(1);
    expect(result.incomplete_image_count_in_viewport).toBe(0);
    expect(result.timeout_reached).toBe(false);
  });

  it("uses the remaining budget while an incomplete image is visible", async () => {
    prepareDocument();
    const image = incompleteImage({ top: 10, bottom: 110 });
    document.body.append(image);

    const result = await observeCaptureReadiness(350);
    expect(result.process_state).toBe("TIMEOUT");
    expect(result.incomplete_image_count_total).toBe(1);
    expect(result.incomplete_image_count_in_viewport).toBe(1);
    expect(result.timeout_reached).toBe(true);
    expect(result.settle_duration_ms).toBeGreaterThanOrEqual(300);
  });

  it("T05_READINESS_ERROR_PARTIAL: reports ERROR instead of false stable readiness", async () => {
    prepareDocument();
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => {
        throw new Error("readiness probe failure");
      },
    });

    const result = await observeCaptureReadiness(1_500);
    expect(result.process_state).toBe("ERROR");
    expect(result.availability).toBe("ERROR");
    expect(result.timeout_reached).toBe(false);
    expect(result.viewport_image_readiness.candidate_count).toBe(0);
  });
});

function prepareDocument(): void {
  Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
  Object.defineProperty(document, "fonts", { configurable: true, value: undefined });
  Object.defineProperty(document, "getAnimations", { configurable: true, value: () => [] });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_024 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  Object.defineProperty(document.documentElement, "scrollWidth", {
    configurable: true,
    value: 1_024,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 2_500,
  });
}

function incompleteImage(vertical: { top: number; bottom: number }): HTMLImageElement {
  const image = document.createElement("img");
  Object.defineProperty(image, "complete", { configurable: true, value: false });
  image.getBoundingClientRect = () =>
    ({
      x: 10,
      y: vertical.top,
      top: vertical.top,
      right: 110,
      bottom: vertical.bottom,
      left: 10,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  return image;
}
