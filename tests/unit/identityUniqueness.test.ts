// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildElementIdentities,
  createIdentityContext,
  structuralOrdinals,
} from "../../src/domain/identity";

function nest(parent: Element, depth: number): HTMLElement {
  let current = parent;
  for (let index = 0; index < depth; index += 1) {
    const child = document.createElement("div");
    current.append(child);
    current = child;
  }
  return current as HTMLElement;
}

describe("identity uniqueness hardening", () => {
  it("does not accept duplicate HTML IDs as stable identities", () => {
    document.body.textContent = "";
    const first = document.createElement("section");
    const second = document.createElement("section");
    first.id = "duplicate";
    second.id = "duplicate";
    document.body.append(first, second);

    const identities = buildElementIdentities([first, second], "STRICT");
    expect(identities.every((identity) => identity.identity_source === "STRUCTURAL_PATH")).toBe(
      true,
    );
    expect(new Set(identities.map((identity) => identity.stable_dom_reference)).size).toBe(2);
    expect(identities.every((identity) => identity.unique_in_document)).toBe(true);
    expect(identities.every((identity) => identity.reference_occurrence_count === 1)).toBe(true);
    expect(identities.every((identity) => identity.collision_count === 0)).toBe(true);
  });

  it("retains enough ancestry to keep deep sibling paths distinct", () => {
    document.body.textContent = "";
    const left = document.createElement("main");
    const right = document.createElement("main");
    document.body.append(left, right);
    const leftLeaf = nest(left, 16);
    const rightLeaf = nest(right, 16);

    const identities = buildElementIdentities([leftLeaf, rightLeaf], "STRICT");
    expect(identities[0]?.stable_dom_reference).not.toBe(identities[1]?.stable_dom_reference);
    expect(identities.every((identity) => identity.identity_status === "UNIQUE")).toBe(true);
  });

  it("indexes sibling and nth-of-type ordinals once per capture context", () => {
    document.body.textContent = "";
    const parent = document.createElement("div");
    document.body.append(parent);
    const children: Element[] = [];
    for (let index = 0; index < 1_500; index += 1) {
      const child = document.createElement(index % 2 === 0 ? "span" : "strong");
      parent.append(child);
      children.push(child);
    }
    const context = createIdentityContext(document);
    const identities = buildElementIdentities(children, "STRICT", context);

    expect(identities).toHaveLength(1_500);
    const secondChild = children[1];
    const finalChild = children[1_499];
    expect(secondChild).toBeDefined();
    expect(finalChild).toBeDefined();
    if (!secondChild || !finalChild) throw new Error("Expected identity fixtures.");
    expect(structuralOrdinals(secondChild, context)).toEqual({
      siblingIndex: 1,
      nthOfType: 1,
    });
    expect(structuralOrdinals(finalChild, context)).toEqual({
      siblingIndex: 1_499,
      nthOfType: 750,
    });
  });
});
