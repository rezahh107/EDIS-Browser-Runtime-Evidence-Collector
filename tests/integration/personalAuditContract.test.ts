import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import contract from "../e2e/browser-qualification-contract.json";

describe("personal release audit contract", () => {
  it("derives browser and repository counts instead of using stale release literals", async () => {
    const source = await readFile("scripts/audit-personal-release-evidence.mjs", "utf8");
    expect(contract.expected_total).toBe(contract.tests.length);
    expect(contract.expected_total).toBe(
      Object.values(contract.expected_files).reduce((total, count) => total + count, 0),
    );
    expect(source).toContain("expectedBrowserTestsPerTarget");
    expect(source).toContain("repository.numTotalTests");
    expect(source).not.toContain("browser.tests !== 29");
    expect(source).not.toContain("expectedRepositoryTests");
    expect(source).not.toContain('"218"');
  });
});
