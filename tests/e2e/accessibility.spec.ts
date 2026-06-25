import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { launchExtensionHarness, openExtensionPage, type ExtensionHarness } from "./harness";

let harness: ExtensionHarness;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "accessibility-en" });
});

test.afterAll(async () => {
  await harness?.close("accessibility-en");
});

for (const target of ["popup/index.html", "sidepanel/index.html", "options/index.html"] as const) {
  test(`${target} supports keyboard use, minimum width, reduced motion, status announcements, and axe`, async () => {
    const page = await openExtensionPage(harness, target);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    expect(await page.locator("[role='status'], [aria-live]").count()).toBeGreaterThan(0);
    expect(
      await page.locator("html").evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(680);
    const transition = await page
      .locator("button")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { duration: style.transitionDuration, animation: style.animationDuration };
      });
    expect(["0s", "0ms", ""]).toContain(transition.duration);
    expect(["0s", "0ms", ""]).toContain(transition.animation);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.close();
  });
}

test("options clear-data confirmation restores focus and has a logical keyboard order", async () => {
  const page = await openExtensionPage(harness, "options/index.html");
  await page.locator("#capture-profile").focus();
  const expectedSequence = ["capture-intent", "redaction-mode", "include-screenshot"];
  const observed: string[] = [];
  for (const expected of expectedSequence) {
    await page.keyboard.press("Tab");
    observed.push(
      await page
        .locator(":focus")
        .getAttribute("id")
        .then((value) => value ?? ""),
    );
    expect(observed.at(-1)).toBe(expected);
  }

  await page.locator("#clear-data").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#clear-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#clear-data")).toBeFocused();
  await page.close();
});

test("Persian browser locale renders extension pages as RTL with localized control names", async () => {
  const faHarness = await launchExtensionHarness({ locale: "fa", name: "accessibility-fa" });
  let page: Page | undefined;
  try {
    page = await openExtensionPage(faHarness, "options/index.html");
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    expect((await page.locator("html").getAttribute("lang"))?.toLowerCase()).toContain("fa");
    await expect(page.locator("h1")).toContainText("تنظیمات");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await page?.close().catch(() => undefined);
    await faHarness.close("accessibility-fa");
  }
});
