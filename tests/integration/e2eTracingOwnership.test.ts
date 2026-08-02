import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Playwright E2E tracing ownership", () => {
  it("keeps trace lifecycle in Playwright while preserving Harness media and logs", async () => {
    const [harness, playwrightConfig] = await Promise.all([
      readFile("tests/e2e/harness.ts", "utf8"),
      readFile("playwright.config.ts", "utf8"),
    ]);

    expect(harness).not.toContain("context.tracing.start");
    expect(harness).not.toContain("context.tracing.stop");
    expect(harness).toContain('process.env.EDIS_E2E_CAPTURE_MEDIA === "true"');
    expect(harness).toContain("recordVideo:");
    expect(harness).toContain('path.join(artifacts, "video")');
    expect(harness).toContain("`${name}-browser-log.json`");
    expect(harness).toContain("await context.close()");

    expect(playwrightConfig).toContain('trace: "retain-on-failure"');
    expect(playwrightConfig).toContain('screenshot: "only-on-failure"');
    expect(playwrightConfig).toContain('video: "retain-on-failure"');
  });
});
