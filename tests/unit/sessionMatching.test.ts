import { describe, expect, it } from "vitest";
import { determineMatchStatus } from "../../src/domain/session";

describe("session matching", () => {
  it("does not claim exact without combined evidence", () => {
    expect(
      determineMatchStatus({
        normalizedOriginMatches: true,
        documentIdMatches: false,
        elementorIdsOverlap: 2,
        userConfirmed: false,
      }),
    ).toBe("PROBABLE");
  });

  it("honors explicit user confirmation without claiming exact", () => {
    expect(
      determineMatchStatus({
        normalizedOriginMatches: false,
        documentIdMatches: false,
        elementorIdsOverlap: 0,
        userConfirmed: true,
      }),
    ).toBe("USER_CONFIRMED");
  });
});
