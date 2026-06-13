import { describe, expect, it } from "vitest";
import {
  BASE_STYLE_ALLOWLIST,
  COLOR_STYLE_ALLOWLIST,
  isAllowedStyleProperty,
  styleAllowlist,
} from "../../src/domain/styleAllowlist";

describe("computed style allowlist", () => {
  it("contains required layout and typography properties", () => {
    expect(BASE_STYLE_ALLOWLIST).toContain("position");
    expect(BASE_STYLE_ALLOWLIST).toContain("grid-template-columns");
    expect(BASE_STYLE_ALLOWLIST).toContain("font-size");
    expect(BASE_STYLE_ALLOWLIST).toContain("pointer-events");
  });

  it("keeps colors disabled by default", () => {
    expect(styleAllowlist(false)).not.toContain("color");
    expect(styleAllowlist(true)).toEqual(expect.arrayContaining([...COLOR_STYLE_ALLOWLIST]));
    expect(isAllowedStyleProperty("background-image", true)).toBe(false);
  });
});
