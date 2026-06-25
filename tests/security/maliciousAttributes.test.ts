// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElementIdentity } from "../../src/domain/identity";
import { sanitizeClassTokens, stableIdCandidate } from "../../src/domain/redaction";

describe("malicious attributes", () => {
  it("does not retain script-like, sensitive, or token-like identity data", () => {
    document.body.textContent = "";
    const element = document.createElement("div");
    element.id = "password-field";
    element.className = "elementor-widget eyJabcdefgh.abcdefgh.abcdefgh";
    document.body.append(element);
    const identity = buildElementIdentity(element, "STANDARD");
    expect(identity.stable_dom_reference).not.toContain("password-field");
    expect(identity.class_tokens).toEqual(["elementor-widget"]);
    expect(stableIdCandidate("secret-token")).toBeNull();
  });

  it("accepts only bounded plain class tokens", () => {
    expect(
      sanitizeClassTokens(["safe_class", "user@example.com", "x".repeat(80)], "STANDARD"),
    ).toEqual(["safe_class"]);
  });
});
