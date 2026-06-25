// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectElements } from "../../src/content/collectors/element";
import { createCaptureMeasurementContext } from "../../src/content/measurements/context";
import { selectElements } from "../../src/content/selectors/selectElements";
import { makeCaptureConfiguration } from "../helpers/fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe("capture-scoped performance caches", () => {
  it("reuses computed styles across selection, geometry, visibility, relationships, and style collection", async () => {
    document.body.textContent = "";
    const container = document.createElement("main");
    document.body.append(container);
    for (let index = 0; index < 80; index += 1) {
      const element = document.createElement("div");
      element.className = "elementor-element";
      element.dataset.id = `item-${index}`;
      element.textContent = `item ${index}`;
      container.append(element);
    }

    const original = window.getComputedStyle.bind(window);
    const computedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element, pseudoElement) => original(element, pseudoElement));
    const context = createCaptureMeasurementContext(document);
    const selection = selectElements(200, 12, true, context);
    await collectElements(
      selection.elements,
      {
        ...makeCaptureConfiguration(),
        includeHiddenElements: true,
        includeTextShape: false,
      },
      undefined,
      context,
    );

    const totalElements = document.getElementsByTagName("*").length;
    expect(selection.elements.length).toBeGreaterThanOrEqual(80);
    expect(computedStyle.mock.calls.length).toBeLessThanOrEqual(totalElements);
  });

  it("stops text traversal when every selected element reaches its deterministic budget", async () => {
    const root = document.createElement("section");
    root.className = "elementor-element";
    document.body.append(root);
    for (let index = 0; index < 5_000; index += 1) {
      const span = document.createElement("span");
      span.textContent = `word-${index}`;
      root.append(span);
    }

    const originalCreateTreeWalker = document.createTreeWalker.bind(document);
    let textWalkerSteps = 0;
    vi.spyOn(document, "createTreeWalker").mockImplementation((walkRoot, whatToShow, filter) => {
      const walker = originalCreateTreeWalker(walkRoot, whatToShow, filter);
      if (whatToShow === NodeFilter.SHOW_TEXT) {
        const nextNode = walker.nextNode.bind(walker);
        walker.nextNode = () => {
          textWalkerSteps += 1;
          return nextNode();
        };
      }
      return walker;
    });

    const result = await collectElements(
      [root],
      {
        ...makeCaptureConfiguration(),
        includeTextShape: true,
        includeInteractionFacts: false,
        includeRelationshipGraph: false,
      },
      undefined,
      createCaptureMeasurementContext(document),
    );

    expect(textWalkerSteps).toBeLessThan(700);
    expect(result.measurements[0]?.text_shape.measurement_status).toBe("BOUNDED_LIMIT_REACHED");
    expect(
      result.diagnostics.some((item) => item.code === "EDIS_RUNTIME_TEXT_SHAPE_LIMIT_REACHED"),
    ).toBe(true);
  });
});
