import { describe, expect, it } from "vitest";
import { classifyBrowserFamily } from "../../scripts/e2e-environment.mjs";

describe("E2E browser identity classification", () => {
  it.each([
    ["/usr/bin/google-chrome", "Google Chrome 150.0.7871.128", "chrome"],
    ["/usr/bin/microsoft-edge", "Microsoft Edge 150.0.0.0", "edge"],
    ["/opt/chrome-for-testing/chrome", "Google Chrome for Testing 148.0.0.0", "chromium"],
    ["/home/runner/.cache/ms-playwright/chromium-1194/chrome", "Chromium 148.0.0.0", "chromium"],
  ] as const)("classifies %s (%s) as %s", (executable, version, expected) => {
    expect(classifyBrowserFamily(executable, version)).toBe(expected);
  });

  it("never classifies Chrome for Testing as exact Google Chrome", () => {
    expect(
      classifyBrowserFamily(
        "/home/runner/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
        "Google Chrome for Testing 148.0.0.0",
      ),
    ).not.toBe("chrome");
  });
});
