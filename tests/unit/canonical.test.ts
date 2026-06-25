import { describe, expect, it } from "vitest";
import {
  CanonicalizationError,
  MAX_CANONICAL_COLLECTION_ENTRIES,
  MAX_CANONICAL_DEPTH,
  MAX_CANONICAL_NODES,
  canonicalJson,
  canonicalSemanticJson,
  canonicalize,
  parseSafeJson,
} from "../../src/domain/canonical";

describe("canonical serialization", () => {
  it("sorts object keys and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: [2, 1] })).toBe('{"a":[2,1],"z":1}\n');
  });

  it("rejects non-finite numbers with a stable TypeError code", () => {
    expectCanonicalCode(
      () => canonicalize({ value: Number.NaN }),
      "EDIS_CANONICAL_NON_FINITE_NUMBER",
    );
  });

  it("removes observation ordering and readiness timing from semantic replay", () => {
    const first = {
      snapshot_id: "snapshot-a",
      observation_index: 0,
      capture_readiness: { sample_count: 3, settle_duration_ms: 300 },
      value: "stable",
    };
    const second = {
      snapshot_id: "snapshot-b",
      observation_index: 7,
      capture_readiness: { sample_count: 8, settle_duration_ms: 900 },
      value: "stable",
    };
    expect(canonicalSemanticJson(first)).toBe(canonicalSemanticJson(second));
  });

  it("rejects prototype-sensitive keys", () => {
    expectCanonicalCode(
      () => parseSafeJson('{"__proto__":{"polluted":true}}'),
      "EDIS_CANONICAL_UNSAFE_KEY",
    );
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("rejects direct and indirect cycles deterministically", () => {
    const direct: Record<string, unknown> = {};
    direct.self = direct;
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = { first };
    first.second = second;
    expectCanonicalCode(() => canonicalize(direct), "EDIS_CANONICAL_CYCLE");
    expectCanonicalCode(() => canonicalize(first), "EDIS_CANONICAL_CYCLE");
  });

  it("permits repeated non-cyclic references", () => {
    const shared = { value: 7 };
    expect(canonicalJson({ left: shared, right: shared })).toBe(
      '{"left":{"value":7},"right":{"value":7}}\n',
    );
  });

  it("accepts the maximum configured depth and rejects the next level", () => {
    expect(() => canonicalize(nestedArray(MAX_CANONICAL_DEPTH))).not.toThrow();
    expectCanonicalCode(
      () => canonicalize(nestedArray(MAX_CANONICAL_DEPTH + 1)),
      "EDIS_CANONICAL_DEPTH_LIMIT",
    );
  });

  it("enforces the maximum collection size", () => {
    expect(() =>
      canonicalize(new Array(MAX_CANONICAL_COLLECTION_ENTRIES).fill(null)),
    ).not.toThrow();
    expectCanonicalCode(
      () => canonicalize(new Array(MAX_CANONICAL_COLLECTION_ENTRIES + 1).fill(null)),
      "EDIS_CANONICAL_COLLECTION_LIMIT",
    );
  });

  it("enforces the maximum total visited-node budget", () => {
    const groups = Array.from(
      { length: Math.ceil(MAX_CANONICAL_NODES / MAX_CANONICAL_COLLECTION_ENTRIES) },
      (): null[] => Array.from({ length: MAX_CANONICAL_COLLECTION_ENTRIES }, () => null),
    );
    expectCanonicalCode(() => canonicalize(groups), "EDIS_CANONICAL_NODE_LIMIT");
  });

  it("rejects unsupported values instead of sanitizing them", () => {
    expectCanonicalCode(() => canonicalize(1n), "EDIS_CANONICAL_UNSUPPORTED_TYPE");
    expectCanonicalCode(() => canonicalize(() => undefined), "EDIS_CANONICAL_UNSUPPORTED_TYPE");
    expectCanonicalCode(() => canonicalize({ value: undefined }), "EDIS_CANONICAL_UNDEFINED");
  });

  it("rejects unpaired Unicode surrogates", () => {
    expectCanonicalCode(() => canonicalJson("\ud800"), "EDIS_CANONICAL_INVALID_UNICODE");
  });
});

function nestedArray(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) value = [value];
  return value;
}

function expectCanonicalCode(action: () => unknown, code: CanonicalizationError["code"]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toBeInstanceOf(CanonicalizationError);
    expect((error as CanonicalizationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected canonicalization error ${code}.`);
}
