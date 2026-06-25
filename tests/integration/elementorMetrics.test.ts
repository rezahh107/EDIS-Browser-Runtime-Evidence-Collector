// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectElements } from "../../src/content/collectors/element";
import { collectDocumentMetrics } from "../../src/content/collectors/page";
import { selectElements } from "../../src/content/selectors/selectElements";
import {
  assertElementorMetricInvariant,
  computeSkippedElementorElements,
} from "../../src/domain/elementorMetrics";
import { makeCaptureConfiguration } from "../helpers/fixtures";

function node(
  attributes: Record<string, string> = {},
  className = "",
  display: string | null = null,
): HTMLElement {
  const value = document.createElement("div");
  value.className = className;
  for (const [name, attributeValue] of Object.entries(attributes)) {
    value.setAttribute(name, attributeValue);
  }
  if (display !== null) value.style.display = display;
  return value;
}

function resetBody(...elements: HTMLElement[]): void {
  document.body.replaceChildren(...elements);
}

describe("Elementor metric consistency", () => {
  it("uses the shared classifier for discovered and emitted counts", async () => {
    resetBody(
      node({ "data-elementor-id": "page" }),
      node({}, "elementor-section"),
      node({ "data-id": "abc" }, "e-con"),
      node({ "data-id": "generic" }),
    );
    const selected = selectElements(100, 20, true);
    const emitted = await collectElements(selected.elements, makeCaptureConfiguration());

    expect(selected.metrics.elementorElements).toBe(3);
    expect(emitted.metrics.elementorElements).toBe(3);

    const metrics = collectDocumentMetrics(
      selected.scannedNodes,
      selected.maximumDepth,
      emitted.measurements.length,
      selected.truncatedBranchCount,
      selected.metrics,
      emitted.metrics,
      selected.skippedHiddenSubtreeCount,
      selected.skippedHiddenDirectChildCount,
    );
    expect(metrics.discovered_elementor_elements).toBe(3);
    expect(metrics.emitted_elementor_elements).toBe(3);
    expect(metrics.skipped_elementor_elements).toBe(0);
  });

  it("records hidden Elementor evidence as skipped without violating the invariant", async () => {
    const hidden = node({}, "elementor-widget-heading", "none");
    hidden.append(document.createElement("span"));
    resetBody(node({}, "elementor-section"), hidden);
    const selected = selectElements(100, 20, false);
    const emitted = await collectElements(selected.elements, makeCaptureConfiguration());
    const metrics = collectDocumentMetrics(
      selected.scannedNodes,
      selected.maximumDepth,
      emitted.measurements.length,
      selected.truncatedBranchCount,
      selected.metrics,
      emitted.metrics,
      selected.skippedHiddenSubtreeCount,
      selected.skippedHiddenDirectChildCount,
    );

    expect(metrics.discovered_elementor_elements).toBe(2);
    expect(metrics.emitted_elementor_elements).toBe(1);
    expect(metrics.skipped_elementor_elements).toBe(1);
    expect(() => assertElementorMetricInvariant(metrics)).not.toThrow();
  });

  it("fails closed when Elementor metric relationships are contradictory", () => {
    expect(() => computeSkippedElementorElements(2, 3)).toThrow(
      /EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION/,
    );
    expect(() =>
      assertElementorMetricInvariant({
        discovered_elementor_elements: 3,
        emitted_elementor_elements: 2,
        skipped_elementor_elements: 0,
      }),
    ).toThrow(/EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION/);
  });
});
