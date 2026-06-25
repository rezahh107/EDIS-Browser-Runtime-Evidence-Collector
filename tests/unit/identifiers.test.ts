import { describe, expect, it } from "vitest";
import {
  deterministicUuid,
  nextRequestId,
  runtimeProvenanceSeed,
} from "../../src/domain/identifiers";
import { isRequestId } from "../../src/domain/validation";

describe("deterministic identifiers", () => {
  it("derives stable UUID-shaped identifiers without randomness", async () => {
    const first = await deterministicUuid("namespace", "value");
    const second = await deterministicUuid("namespace", "value");
    expect(second).toBe(first);
    expect(isRequestId(first)).toBe(true);
  });

  it("creates unique runtime provenance seeds for independent captures", () => {
    const first = runtimeProvenanceSeed("session", ["1", "Chrome", "149"]);
    const second = runtimeProvenanceSeed("session", ["1", "Edge", "149"]);
    expect(first).not.toBe(second);
    expect(first).toContain("Chrome");
    expect(second).toContain("Edge");
  });

  it("creates distinct monotonic request identifiers", () => {
    const first = nextRequestId("test");
    const second = nextRequestId("test");
    expect(first).not.toBe(second);
    expect(isRequestId(first)).toBe(true);
    expect(isRequestId(second)).toBe(true);
  });
});
