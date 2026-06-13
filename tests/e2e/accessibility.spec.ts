import AxeBuilder from "@axe-core/playwright";
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  const extensionPath = path.resolve("dist/chrome");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  context = await chromium.launchPersistentContext("", {
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  if (typeof context !== "undefined") await context.close();
});

test("options supports keyboard focus, 200 percent zoom, RTL, aria-live, and axe", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/index.html`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    document.documentElement.dir = "rtl";
  });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await expect(page.locator("[aria-live]")).toHaveCount(1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.close();
});
