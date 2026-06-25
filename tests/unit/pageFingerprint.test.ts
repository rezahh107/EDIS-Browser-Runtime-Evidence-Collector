import { describe, expect, it } from "vitest";
import {
  computePageFingerprintEvidence,
  normalizePageElementorIds,
} from "../../src/domain/pageFingerprint";

describe("page fingerprint evidence", () => {
  it("normalizes Elementor identifiers deterministically", () => {
    expect(normalizePageElementorIds([" b ", "a", "a", "", "unsafe value", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is independent of raw Elementor identifier ordering", async () => {
    const first = await computePageFingerprintEvidence({
      rawUrl: "https://example.test/page/?utm_source=x#section",
      pageMarkerPresent: true,
      rawDataElementorIds: ["node-b", "node-a", "node-b"],
      bindingContext: null,
    });
    const second = await computePageFingerprintEvidence({
      rawUrl: "https://example.test/page/#other",
      pageMarkerPresent: true,
      rawDataElementorIds: ["node-a", "node-b"],
      bindingContext: null,
    });

    expect(second.raw_data_elementor_ids).toEqual(first.raw_data_elementor_ids);
    expect(second.page_fingerprint).toBe(first.page_fingerprint);
    expect(second.page_locator_sha256).toBe(first.page_locator_sha256);
  });
});
