import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/{unit,integration,security}/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] },
    testTimeout: 10000,
  },
});
