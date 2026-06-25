// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { classifyElementorMarker } from "../../src/domain/elementorMarker";

function element(attributes: Record<string, string> = {}, className = ""): HTMLElement {
  const value = document.createElement("div");
  value.className = className;
  for (const [name, attributeValue] of Object.entries(attributes)) {
    value.setAttribute(name, attributeValue);
  }
  return value;
}

describe("Elementor runtime marker classification", () => {
  it("uses one deterministic evidence contract for supported marker shapes", () => {
    expect(classifyElementorMarker(element({ "data-elementor-id": "123" }))).toEqual({
      matched: true,
      reasons: ["DATA_ELEMENTOR_ID"],
    });
    expect(
      classifyElementorMarker(element({ "data-id": "abc123" }, "elementor-widget-heading")),
    ).toEqual({
      matched: true,
      reasons: ["DATA_ID_WITH_ELEMENTOR_CLASS", "ELEMENTOR_CLASS"],
    });
    expect(classifyElementorMarker(element({ "data-id": "abc123" }, "e-con"))).toEqual({
      matched: true,
      reasons: ["DATA_ID_WITH_ELEMENTOR_CLASS", "ELEMENTOR_CLASS"],
    });
    expect(classifyElementorMarker(element({}, "elementor-section"))).toEqual({
      matched: true,
      reasons: ["ELEMENTOR_CLASS"],
    });
  });

  it("does not treat data-id alone or similar class names as Elementor evidence", () => {
    expect(classifyElementorMarker(element({ "data-id": "abc123" }))).toEqual({
      matched: false,
      reasons: [],
    });
    expect(classifyElementorMarker(element({}, "elementor xe-con pre-elementor-widget"))).toEqual({
      matched: false,
      reasons: [],
    });
  });
});
