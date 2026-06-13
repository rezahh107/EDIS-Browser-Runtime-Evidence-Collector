import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/server.mjs",
    port: 4173,
    reuseExistingServer: true,
  },
});
