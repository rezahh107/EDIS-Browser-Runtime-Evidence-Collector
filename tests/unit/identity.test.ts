// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildElementIdentity,
  runtimeElementorMarkers,
  stableDomReference,
} from "../../src/domain/identity";

describe("element identity", () => {
  it("preserves raw Elementor markers separately from runtime identity", () => {
    document.body.textContent = "";
    const element = document.createElement("section");
    element.className = "elementor-element";
    element.setAttribute("data-id", "abc123");
    document.body.append(element);
    const identity = buildElementIdentity(element, "STANDARD");
    const markers = runtimeElementorMarkers(element);
    expect(markers.data_id).toBe("abc123");
    expect(identity.stable_dom_reference).not.toContain("abc123");
  });

  it("builds deterministic structural references", () => {
    document.body.textContent = "";
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    expect(stableDomReference(second)).toContain("div:nth-of-type(2)");
  });
});
