import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const JOBS = ["quality", "e2e-smoke", "e2e-nightly"] as const;

describe("CI canonical workspace integrity", () => {
  it.each(JOBS)("restores the canonical lockfile before validation in %s", async (jobName) => {
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    const job = jobBlock(workflow, jobName);
    const preserve = job.indexOf("- name: Preserve canonical npm lockfile");
    const normalize = job.indexOf("- name: Normalize npm lockfile registry URLs for installation");
    const install = job.indexOf("- run: npm ci --registry=https://registry.npmjs.org/");
    const restore = job.indexOf("- name: Restore canonical npm lockfile");
    const validation = firstValidationIndex(job);

    expect(preserve).toBeGreaterThanOrEqual(0);
    expect(normalize).toBeGreaterThan(preserve);
    expect(install).toBeGreaterThan(normalize);
    expect(restore).toBeGreaterThan(install);
    expect(validation).toBeGreaterThan(restore);
    expect(job.slice(preserve, normalize)).toContain(
      'cp package-lock.json "$RUNNER_TEMP/package-lock.canonical.json"',
    );
    expect(job.slice(restore, validation)).toContain(
      'cp "$RUNNER_TEMP/package-lock.canonical.json" package-lock.json',
    );
    expect(job.slice(restore, validation)).toContain("git diff --exit-code -- package-lock.json");
  });
});

function jobBlock(workflow: string, jobName: (typeof JOBS)[number]): string {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start < 0) throw new Error(`Missing CI job: ${jobName}`);
  const end = lines.findIndex((line, index) => index > start && /^ {2}[\w-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function firstValidationIndex(job: string): number {
  const candidates = [
    job.indexOf("- run: npm run release:gate:no-browser"),
    job.indexOf("- run: npx playwright install --with-deps chromium"),
  ].filter((index) => index >= 0);
  return Math.min(...candidates);
}
