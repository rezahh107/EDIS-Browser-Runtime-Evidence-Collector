import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalize, parseSafeJson } from "../../src/domain/canonical";

describe("canonical serialization", () => {
  it("sorts object keys and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: [2, 1] })).toBe(
      '{\n  "a": [\n    2,\n    1\n  ],\n  "z": 1\n}\n',
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize({ value: Number.NaN })).toThrow(/Non-finite/);
  });

  it("rejects prototype-sensitive keys", () => {
    expect(() => parseSafeJson('{"__proto__":{"polluted":true}}')).toThrow(/Unsafe object key/);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
