// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElementIdentity, stableDomReference } from "../../src/domain/identity";

describe("element identity", () => {
  it("prefers real Elementor identifiers", () => {
    document.body.textContent = "";
    const element = document.createElement("section");
    element.className = "elementor-element";
    element.setAttribute("data-id", "abc123");
    document.body.append(element);
    const identity = buildElementIdentity(element, "STANDARD");
    expect(identity.data_id).toBe("abc123");
    expect(identity.identity_confidence).toBe("STRONG");
  });

  it("builds deterministic structural references", () => {
    document.body.textContent = "";
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    expect(stableDomReference(second)).toContain("div:nth-of-type(2)");
  });
});
