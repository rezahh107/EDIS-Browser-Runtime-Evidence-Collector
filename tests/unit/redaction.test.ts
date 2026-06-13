import { describe, expect, it } from "vitest";
import {
  limitedTextPreview,
  normalizeUrl,
  sanitizeClassTokens,
  stableIdCandidate,
} from "../../src/domain/redaction";

describe("redaction", () => {
  it("removes URL query and fragment", () => {
    expect(normalizeUrl("https://Example.com/a//b/?token=secret#private", true)).toEqual({
      origin: "https://example.com",
      path: "/a/b",
    });
  });

  it("filters sensitive and random class tokens", () => {
    const tokens = sanitizeClassTokens(
      ["elementor-widget", "password-field", "abcdef0123456789abcdef0123456789", "layout"],
      "STANDARD",
    );
    expect(tokens).toEqual(["elementor-widget", "layout"]);
  });

  it("redacts emails and truncates previews", () => {
    expect(limitedTextPreview("Contact user@example.com for a very long response", 30)).toBe(
      "Contact [redacted-email] for …",
    );
  });

  it("rejects unstable identifiers", () => {
    expect(stableIdCandidate("a4f7b19c2d3e4f5a6b7c8d9e0f1a2b3c")).toBeNull();
    expect(stableIdCandidate("hero-section")).toBe("hero-section");
  });
});
