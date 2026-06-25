import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("browser qualification evidence", () => {
  it("does not hard-code a browser executable and requires recorded provenance", () => {
    const source = readFileSync("scripts/aggregate-browser-qualification.mjs", "utf8");
    expect(source).not.toContain('spawnSync("/usr/bin/chromium"');
    expect(source).toContain("executable_sha256");
    expect(source).toContain("extension_artifact_sha256");
    expect(source).toContain("service_worker_url");
    expect(source).toContain("qualification_scope");
  });

  it("emits insufficient evidence instead of PASS when the browser cannot run", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "edis-browser-unavailable-"));
    writeFileSync(
      path.join(root, "environment-unavailable.json"),
      JSON.stringify({ schema_version: "1.1.0", status: "UNAVAILABLE", reason: "fixture" }),
    );
    execFileSync(process.execPath, ["scripts/aggregate-browser-qualification.mjs", root]);
    const result: unknown = JSON.parse(
      readFileSync(path.join(root, "browser-qualification.json"), "utf8"),
    );
    expect(isRecord(result)).toBe(true);
    if (!isRecord(result)) throw new Error("Qualification result is not an object.");
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.exact_chrome_qualified).toBe(false);
    expect(result.automated_chromium_qualified).toBe(false);
  });

  it("rejects a report whose environment provenance is incomplete", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "edis-browser-invalid-"));
    mkdirSync(path.join(root, "shard"));
    writeFileSync(
      path.join(root, "shard", "environment.json"),
      JSON.stringify({ schema_version: "1.1.0" }),
    );
    writeFileSync(
      path.join(root, "shard", "playwright-results.json"),
      JSON.stringify({ stats: { unexpected: 0, skipped: 0, flaky: 0, expected: 0 }, suites: [] }),
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/aggregate-browser-qualification.mjs", root],
      {
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Missing browser environment field");
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
