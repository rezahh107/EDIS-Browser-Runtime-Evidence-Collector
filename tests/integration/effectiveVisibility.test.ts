// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { selectElements } from "../../src/content/selectors/selectElements";
import { inspectEffectiveVisibility } from "../../src/content/measurements/visibility";

describe("effective hidden-element filtering", () => {
  it("T03_VISIBILITY_OVERRIDE: allows a visible descendant to override ancestor visibility hidden", () => {
    document.body.textContent = "";
    const parent = document.createElement("section");
    parent.style.visibility = "hidden";
    const child = document.createElement("button");
    child.id = "visibility-override-child";
    child.style.visibility = "visible";
    parent.append(child);
    document.body.append(parent);

    const observation = inspectEffectiveVisibility(child);
    expect(observation.directHidden).toBe(false);
    expect(observation.hiddenByAncestor).toBe(false);
    expect(observation.effectiveVisible).toBe(true);

    const result = selectElements(100, 20, false);
    expect(result.elements).toContain(child);
    expect(result.skippedHiddenSubtreeCount).toBe(0);
  });

  it("keeps a descendant hidden when visibility remains inherited", () => {
    document.body.textContent = "";
    const parent = document.createElement("section");
    parent.style.visibility = "hidden";
    const child = document.createElement("button");
    parent.append(child);
    document.body.append(parent);

    const observation = inspectEffectiveVisibility(child);
    expect(observation.directHidden).toBe(true);
    expect(observation.effectiveVisible).toBe(false);
    expect(selectElements(100, 20, false).elements).not.toContain(child);
  });

  it("excludes descendants hidden by an ancestor when hidden elements are disabled", () => {
    document.body.textContent = "";
    const hiddenParent = document.createElement("section");
    hiddenParent.style.display = "none";
    const hiddenChild = document.createElement("button");
    hiddenChild.id = "hidden-child";
    hiddenParent.append(hiddenChild);
    const visible = document.createElement("button");
    visible.id = "visible-child";
    document.body.append(hiddenParent, visible);

    const observation = inspectEffectiveVisibility(hiddenChild);
    expect(observation.directHidden).toBe(false);
    expect(observation.hiddenByAncestor).toBe(true);
    expect(observation.effectiveVisible).toBe(false);

    const filtered = selectElements(100, 20, false);
    expect(filtered.elements).toContain(visible);
    expect(filtered.elements).not.toContain(hiddenParent);
    expect(filtered.elements).not.toContain(hiddenChild);

    const inclusive = selectElements(100, 20, true);
    expect(inclusive.elements).toContain(hiddenParent);
    expect(inclusive.elements).toContain(hiddenChild);
  });

  it.each([
    ["display", "none"],
    ["contentVisibility", "hidden"],
    ["opacity", "0"],
  ] as const)(
    "T04_IRREVERSIBLE_HIDDEN_PRUNING: prunes %s=%s while preserving include-hidden behavior",
    (property, value) => {
      document.body.textContent = "";
      const hiddenParent = document.createElement("section");
      Object.assign(hiddenParent.style, { [property]: value });
      const hiddenChild = document.createElement("button");
      hiddenParent.append(hiddenChild);
      document.body.append(hiddenParent);

      const filtered = selectElements(100, 20, false);
      expect(filtered.elements).not.toContain(hiddenParent);
      expect(filtered.elements).not.toContain(hiddenChild);
      expect(filtered.skippedHiddenSubtreeCount).toBe(1);

      const inclusive = selectElements(100, 20, true);
      expect(inclusive.elements).toContain(hiddenParent);
      expect(inclusive.elements).toContain(hiddenChild);
    },
  );

  it("prunes a hidden subtree before it can consume depth budget", () => {
    document.body.textContent = "";
    const hiddenParent = document.createElement("section");
    hiddenParent.style.display = "none";
    let current: Element = hiddenParent;
    for (let index = 0; index < 30; index += 1) {
      const child = document.createElement("div");
      current.append(child);
      current = child;
    }
    const visible = document.createElement("button");
    visible.id = "visible-after-hidden-subtree";
    document.body.append(hiddenParent, visible);

    const result = selectElements(100, 6, false);
    expect(result.elements).toContain(visible);
    expect(result.skippedHiddenSubtreeCount).toBe(1);
    expect(result.skippedHiddenDirectChildCount).toBe(1);
    expect(result.truncatedBranchCount).toBe(0);
    expect(
      result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_DEPTH_LIMIT_REACHED"),
    ).toBe(false);
  });

  it("prunes a synthetic WordPress 7 viewport-hidden block without consuming depth budget", () => {
    document.body.textContent = "";
    const hiddenBlock = document.createElement("section");
    hiddenBlock.className = "wp-block-group wp-block-hidden-mobile";
    hiddenBlock.style.display = "none";
    let current: Element = hiddenBlock;
    for (let index = 0; index < 20; index += 1) {
      const child = document.createElement("div");
      current.append(child);
      current = child;
    }
    const hiddenAction = document.createElement("button");
    hiddenAction.id = "wp7-hidden-action";
    current.append(hiddenAction);
    const visible = document.createElement("section");
    visible.className = "wp-block-group always-visible";
    document.body.append(hiddenBlock, visible);

    const result = selectElements(100, 6, false);
    expect(result.elements).toContain(visible);
    expect(result.elements).not.toContain(hiddenBlock);
    expect(result.elements).not.toContain(hiddenAction);
    expect(result.skippedHiddenSubtreeCount).toBe(1);
    expect(result.truncatedBranchCount).toBe(0);
  });
});
