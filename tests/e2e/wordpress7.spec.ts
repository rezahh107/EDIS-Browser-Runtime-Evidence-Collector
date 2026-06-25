import { expect, test, type Page } from "@playwright/test";
import {
  captureSnapshot,
  clearExtensionData,
  fixture,
  launchExtensionHarness,
  openExtensionPage,
  type ExtensionHarness,
} from "./harness";

let harness: ExtensionHarness;
let control: Page;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "wordpress7" });
  control = await openExtensionPage(harness, "options/index.html");
});

test.afterAll(async () => {
  await control?.close().catch(() => undefined);
  await harness?.close("wordpress7");
});

test.beforeEach(async () => {
  await clearExtensionData(control);
});

const cases = [
  { width: 390, hiddenReference: "#wp7-hidden-mobile" },
  { width: 600, hiddenReference: "#wp7-hidden-tablet" },
  { width: 1024, hiddenReference: "#wp7-hidden-desktop" },
] as const;

for (const item of cases) {
  test(`synthetic WordPress 7 viewport-hidden subtree is pruned at ${item.width}px`, async () => {
    const page = await harness.context.newPage();
    await page.setViewportSize({ width: item.width, height: 800 });
    await fixture(page, "wordpress-7-block-visibility.html");

    const { snapshot } = await captureSnapshot(control, page, {
      includeHidden: false,
      maxDepth: 8,
      maxElements: 500,
    });

    expect(
      snapshot.elements.some((element) =>
        element.identity.stable_dom_reference.includes("#wp7-always-visible"),
      ),
    ).toBe(true);
    expect(
      snapshot.elements.some((element) =>
        element.identity.stable_dom_reference.includes(item.hiddenReference),
      ),
    ).toBe(false);
    expect(snapshot.capture_completeness.skipped_hidden_subtree_count).toBeGreaterThanOrEqual(1);
    expect(snapshot.capture_completeness.truncated_branch_count).toBe(0);
    expect(snapshot.capture_completeness.reasons).not.toContain("EDIS_RUNTIME_DEPTH_LIMIT_REACHED");
    await page.close();
  });
}

test("include-hidden mode preserves WordPress 7 viewport-hidden evidence", async () => {
  const page = await harness.context.newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  await fixture(page, "wordpress-7-block-visibility.html");

  const { snapshot } = await captureSnapshot(control, page, {
    includeHidden: true,
    maxDepth: 8,
    maxElements: 500,
  });

  expect(
    snapshot.elements.some((element) =>
      element.identity.stable_dom_reference.includes("#wp7-hidden-mobile"),
    ),
  ).toBe(true);
  expect(snapshot.capture_completeness.skipped_hidden_subtree_count).toBe(0);
  await page.close();
});
