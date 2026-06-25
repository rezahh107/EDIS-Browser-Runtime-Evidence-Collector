import { describe, expect, it } from "vitest";
import { determineSourceBindingState } from "../../src/domain/session";

describe("source binding summary", () => {
  it("requires compatible origin, document and element evidence for exact binding", () => {
    expect(
      determineSourceBindingState({
        normalizedOriginMatches: true,
        documentIdMatches: true,
        elementorIdsOverlap: 2,
        userConfirmed: false,
      }),
    ).toBe("EXACT");
  });

  it("does not let user confirmation upgrade insufficient evidence", () => {
    expect(
      determineSourceBindingState({
        normalizedOriginMatches: false,
        documentIdMatches: false,
        elementorIdsOverlap: 0,
        userConfirmed: true,
      }),
    ).toBe("UNMATCHED");
  });

  it("preserves conflicts as ambiguous even when the user confirmed the document", () => {
    expect(
      determineSourceBindingState({
        normalizedOriginMatches: true,
        documentIdMatches: true,
        elementorIdsOverlap: 1,
        userConfirmed: true,
        conflictingEvidence: true,
      }),
    ).toBe("AMBIGUOUS");
  });
});
