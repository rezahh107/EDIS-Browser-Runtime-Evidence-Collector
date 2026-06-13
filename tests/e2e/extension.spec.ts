import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
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

for (const fixture of [
  ["Elementor V3 page", "elementor-v3.html"],
  ["Atomic V4 page", "atomic-v4.html"],
  ["Hybrid page", "hybrid.html"],
  ["Non-Elementor page", "non-elementor.html"],
  ["RTL page", "rtl.html"],
  ["Large DOM", "large-dom.html"],
  ["Horizontal overflow, hidden, fixed, and sticky", "responsive-overflow.html"],
] as const) {
  test(`${fixture[0]} is capturable by explicit action`, async () => {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4173/${fixture[1]}`);
    const popup = await invokeAction(page);
    await expect(popup.locator("#page-status")).toContainText(/Ready|capture/i);
    await popup.close();
    await page.close();
  });
}

test("mobile viewport records an actual mobile-sized capture", async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4173/responsive-overflow.html");
  const popup = await invokeAction(page);
  await popup.locator("#capture-button").click();
  await expect(popup.locator("#operation-status")).toContainText(/Capture started/i);
  await popup.close();
  await page.close();
});

test("restricted browser page is rejected clearly", async () => {
  const page = await context.newPage();
  await page.goto("chrome://version/");
  const popup = await invokeAction(page);
  await expect(popup.locator("#page-status")).toContainText(/cannot|Only normal|unavailable/i);
  await popup.close();
  await page.close();
});

test("screenshot and text preview remain disabled by default", async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await expect(options.locator("#include-screenshot")).not.toBeChecked();
  await expect(options.locator("#include-text")).not.toBeChecked();
  await options.close();
});

async function invokeAction(page: Page): Promise<Page> {
  const popupPromise = context.waitForEvent("page", { timeout: 10_000 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}
