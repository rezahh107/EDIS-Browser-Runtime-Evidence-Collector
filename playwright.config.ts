import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const artifactDirectory = path.resolve(
  process.env.EDIS_E2E_ARTIFACT_DIR ?? "artifacts/browser-e2e",
);
mkdirSync(artifactDirectory, { recursive: true });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(artifactDirectory, "test-results"),
  reporter: [
    ["line"],
    ["json", { outputFile: path.join(artifactDirectory, "playwright-results.json") }],
    ["html", { outputFolder: path.join(artifactDirectory, "html-report"), open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2e/server.mjs",
    port: 4173,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
