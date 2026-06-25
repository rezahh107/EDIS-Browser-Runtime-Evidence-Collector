import { describe, expect, it } from "vitest";
import { isRuntimeSnapshot } from "../../src/domain/validation";
import { makeElementMeasurement, makeSnapshot } from "../helpers/fixtures";

describe("runtime snapshot validation", () => {
  it("accepts the strict top-level snapshot shape", () => {
    expect(isRuntimeSnapshot(makeSnapshot())).toBe(true);
  });

  it("rejects nested development envelopes and non-finite values", () => {
    const snapshot = makeSnapshot();
    expect(isRuntimeSnapshot({ ...snapshot, data: { page: snapshot.page } })).toBe(false);
    expect(
      isRuntimeSnapshot({
        ...snapshot,
        viewport: { ...snapshot.viewport, inner_width: Number.POSITIVE_INFINITY },
      }),
    ).toBe(false);
  });

  it("rejects nondeterministic element ordering and non-allowlisted styles", () => {
    const baseElement = makeElementMeasurement(0);
    const snapshot = makeSnapshot();
    expect(
      isRuntimeSnapshot({
        ...snapshot,
        elements: [baseElement, { ...baseElement, node_id: "node-000002", document_order: 0 }],
      }),
    ).toBe(false);
    expect(
      isRuntimeSnapshot({
        ...snapshot,
        elements: [{ ...baseElement, computed_styles: { backgroundImage: "url(secret)" } }],
      }),
    ).toBe(false);
  });
});
