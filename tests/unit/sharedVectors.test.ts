import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/domain/canonical";
import { normalizeUrlLocator, pageLocatorDigest } from "../../src/domain/urlNormalization";

interface CjCase {
  readonly id: string;
  readonly input: unknown;
  readonly canonical: string;
}
interface CjRejection {
  readonly id: string;
  readonly input_kind: string;
  readonly input_token?: string;
}
interface CjVectors {
  readonly cases: readonly CjCase[];
  readonly rejection_cases: readonly CjRejection[];
}
interface UrlCase {
  readonly id: string;
  readonly input_url: string;
  readonly site_path_scope: string;
  readonly expected_facts: Record<string, unknown>;
  readonly expected_redacted_segment_count: number;
  readonly expected_page_locator_sha256: string;
}
interface UrlRejection {
  readonly id: string;
  readonly input_url: string;
  readonly site_path_scope: string;
}
interface UrlVectors {
  readonly cases: readonly UrlCase[];
  readonly rejection_cases: readonly UrlRejection[];
}

const cj = JSON.parse(
  await readFile(new URL("../../shared-vectors/edis-cj-1-v1.0.0.json", import.meta.url), "utf8"),
) as CjVectors;
const urls = JSON.parse(
  await readFile(new URL("../../shared-vectors/edis-url-1-v1.0.0.json", import.meta.url), "utf8"),
) as UrlVectors;

describe("EDIS-CJ-1 shared vectors", () => {
  for (const vector of cj.cases) {
    it(vector.id, () => expect(canonicalJson(vector.input)).toBe(vector.canonical));
  }
  for (const vector of cj.rejection_cases) {
    it(`rejects ${vector.id}`, () => {
      expect(() => canonicalJson(rejectionValue(vector))).toThrow();
    });
  }
});

describe("EDIS-URL-1 shared vectors", () => {
  for (const vector of urls.cases) {
    it(vector.id, async () => {
      const result = normalizeUrlLocator(vector.input_url, vector.site_path_scope);
      expect(result.facts).toEqual(vector.expected_facts);
      expect(result.redacted_segment_count).toBe(vector.expected_redacted_segment_count);
      expect(await pageLocatorDigest(result.facts)).toBe(vector.expected_page_locator_sha256);
    });
  }
  for (const vector of urls.rejection_cases) {
    it(`rejects ${vector.id}`, () => {
      expect(() => normalizeUrlLocator(vector.input_url, vector.site_path_scope)).toThrow();
    });
  }
});

function rejectionValue(vector: CjRejection): unknown {
  switch (vector.input_kind) {
    case "special_number":
      if (vector.input_token === "NaN") return Number.NaN;
      if (vector.input_token === "Infinity") return Number.POSITIVE_INFINITY;
      if (vector.input_token === "-Infinity") return Number.NEGATIVE_INFINITY;
      return Number(vector.input_token);
    case "undefined_object_value":
      return { value: undefined };
    case "unpaired_high_surrogate":
      return "\ud800";
    case "dangerous_key": {
      const value = Object.create(null) as Record<string, unknown>;
      value[vector.input_token ?? "__proto__"] = true;
      return value;
    }
    default:
      throw new Error(`Unknown rejection vector kind: ${vector.input_kind}`);
  }
}
