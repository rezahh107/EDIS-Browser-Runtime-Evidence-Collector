import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("clean release gate contract", () => {
  it("executes preparation, repository tests, and verification in order", () => {
    const source = readFileSync("scripts/release-gate.mjs", "utf8");
    const prepare = source.indexOf('step("repository-test-prepare"');
    const run = source.indexOf('"repository-test-run"');
    const verify = source.indexOf('step("repository-test-verify"');
    expect(prepare).toBeGreaterThan(0);
    expect(run).toBeGreaterThan(prepare);
    expect(verify).toBeGreaterThan(run);
    expect(source).toContain("await rm(root, { recursive: true, force: true });");
  });

  it("requires source packaging and source-to-build provenance before completion", () => {
    const source = readFileSync("scripts/release-gate.mjs", "utf8");
    const manifest = source.indexOf('step("source-manifest"');
    const sourcePackage = source.indexOf('step("source-package"');
    const provenance = source.indexOf('"release-artifact-provenance"');
    expect(manifest).toBeGreaterThan(0);
    expect(sourcePackage).toBeGreaterThan(manifest);
    expect(provenance).toBeGreaterThan(sourcePackage);
  });
});
