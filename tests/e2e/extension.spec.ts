import { expect, test, type Page } from "@playwright/test";
import {
  clearExtensionData,
  fixture,
  launchExtensionHarness,
  openActionPopup,
  openExtensionPage,
  readStore,
  type ExtensionHarness,
} from "./harness";

let harness: ExtensionHarness;
let control: Page;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "extension-loading" });
  control = await openExtensionPage(harness, "options/index.html");
});

test.afterAll(async () => {
  await control?.close().catch(() => undefined);
  await harness?.close("extension-loading");
});

test("extension loading registers MV3 worker and all presentation pages without runtime errors", async () => {
  const manifest = await harness.worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(
    manifest.background && "service_worker" in manifest.background
      ? manifest.background.service_worker
      : null,
  ).toBe("background/service-worker.js");

  for (const target of ["popup/index.html", "sidepanel/index.html", "options/index.html"]) {
    const page = await openExtensionPage(harness, target);
    await expect(page.locator("main")).toBeVisible();
    if (target === "sidepanel/index.html") {
      await expect(page.locator("#page-status")).toHaveText(/\S/);
      await expect(page.locator("#page-status")).not.toContainText("Message sender was rejected");
    }
    await page.close();
  }

  const locale = await openExtensionPage(harness, "_locales/en/messages.json");
  expect(await locale.locator("body").textContent()).toContain("extensionName");
  await locale.close();
  expect(harness.logs.pageErrors).toEqual([]);
  expect(
    harness.logs.console.filter((line) => /Content Security Policy|Refused to load/i.test(line)),
  ).toEqual([]);
});

test("no capture starts automatically and no persistent content script is registered", async () => {
  await clearExtensionData(control);
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  await page.waitForTimeout(750);
  expect(await readStore(control, "jobs")).toHaveLength(0);
  const registered = await harness.worker.evaluate(() =>
    chrome.scripting.getRegisteredContentScripts(),
  );
  expect(registered).toEqual([]);
  await page.close();
});

test("capture begins only after an explicit extension-UI click and leaves the page unchanged", async () => {
  await clearExtensionData(control);
  const fixturePage = await harness.context.newPage();
  await fixture(fixturePage, "non-elementor.html");
  const before = await fixturePage.locator("html").evaluate((element) => element.outerHTML);

  const popup = await openActionPopup(fixturePage);
  await expect.poll(() => popup.isEnabled("#capture-button")).toBe(true);
  expect(await readStore(control, "jobs")).toHaveLength(0);
  await popup.click("#capture-button");
  await expect
    .poll(() => popup.text("#operation-status"))
    .toMatch(/Capture status|Capture complete/i);

  await expect
    .poll(async () => {
      const jobs = await readStore<Record<string, unknown>>(control, "jobs");
      return jobs.at(-1)?.status;
    })
    .toBe("COMPLETE");
  const after = await fixturePage.locator("html").evaluate((element) => element.outerHTML);
  expect(after).toBe(before);
  const registered = await harness.worker.evaluate(() =>
    chrome.scripting.getRegisteredContentScripts(),
  );
  expect(registered).toEqual([]);
  await popup.close();
  await fixturePage.close();
});

test("restricted browser pages produce a clear diagnostic", async () => {
  const restricted = await harness.context.newPage();
  await restricted.goto("chrome://version/");
  const popup = await openActionPopup(restricted);
  await expect.poll(() => popup.isEnabled("#capture-button")).toBe(false);
  await expect.poll(() => popup.text("#page-status")).toMatch(/cannot|Only normal|unavailable/i);
  await popup.close();
  await restricted.close();
});
