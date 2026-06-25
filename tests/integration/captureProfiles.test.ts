// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { selectElements } from "../../src/content/selectors/selectElements";

function buildDepth(depth: number): void {
  document.body.textContent = "";
  let current: Element = document.body;
  for (let index = 0; index < depth; index += 1) {
    const child = document.createElement("div");
    child.setAttribute("data-level", String(index));
    current.append(child);
    current = child;
  }
}

describe("bounded capture profiles", () => {
  it("reports exact partial coverage for the standard depth limit", () => {
    buildDepth(32);
    const result = selectElements(750, 24, true);
    expect(result.truncatedBranchCount).toBeGreaterThan(0);
    expect(result.firstTruncatedReference).toBeTruthy();
    expect(
      result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_DEPTH_LIMIT_REACHED"),
    ).toBe(true);
  });

  it("allows the same document to complete under the bounded Deep DOM depth", () => {
    buildDepth(32);
    const result = selectElements(1_000, 40, true);
    expect(result.truncatedBranchCount).toBe(0);
    expect(
      result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_DEPTH_LIMIT_REACHED"),
    ).toBe(false);
  });
});
