// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { selectElements } from "../../src/content/selectors/selectElements";

describe("large DOM safety budget", () => {
  it("stops selection and scanning at configured hard bounds", () => {
    document.body.textContent = "";
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 1_500; index += 1) {
      const element = document.createElement("div");
      element.className = "elementor-element";
      element.setAttribute("data-id", `item-${index}`);
      fragment.append(element);
    }
    document.body.append(fragment);

    const result = selectElements(50, 8, true);

    expect(result.elements.length).toBeLessThanOrEqual(50);
    expect(result.scannedNodes).toBeLessThanOrEqual(1_000);
    expect(
      result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED"),
    ).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_SCAN_LIMIT_REACHED")).toBe(
      true,
    );
  });
});
