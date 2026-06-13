import { describe, expect, it } from "vitest";
import { parseSafeJson } from "../../src/domain/canonical";

describe("prototype pollution resistance", () => {
  it("rejects constructor and prototype keys", () => {
    expect(() => parseSafeJson('{"constructor":{"prototype":{"polluted":true}}}')).toThrow();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});
