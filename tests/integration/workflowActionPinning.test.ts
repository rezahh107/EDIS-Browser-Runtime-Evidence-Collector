import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface WorkflowActionReport {
  result: string;
  external_or_local_references: unknown[];
  violations: unknown[];
}

describe("GitHub Actions pin policy", () => {
  it("accepts every checked-in workflow only when external actions use full SHAs", () => {
    const output = path.join(
      mkdtempSync(path.join(tmpdir(), "edis-action-policy-")),
      "report.json",
    );
    execFileSync(process.execPath, [
      "scripts/validate-workflow-actions.mjs",
      "--root",
      ".github/workflows",
      "--output",
      output,
    ]);
    const report = JSON.parse(readFileSync(output, "utf8")) as WorkflowActionReport;
    expect(report.result).toBe("PASS");
    expect(report.external_or_local_references.length).toBeGreaterThan(0);
    expect(report.violations).toEqual([]);
  });

  it("rejects a rolling tag reference", () => {
    const root = mkdtempSync(path.join(tmpdir(), "edis-action-policy-bad-"));
    mkdirSync(path.join(root, "workflows"));
    writeFileSync(
      path.join(root, "workflows", "bad.yml"),
      "name: bad\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
    );
    const result = spawnSync(process.execPath, [
      "scripts/validate-workflow-actions.mjs",
      "--root",
      path.join(root, "workflows"),
      "--output",
      path.join(root, "report.json"),
    ]);
    expect(result.status).toBe(1);
  });
});
