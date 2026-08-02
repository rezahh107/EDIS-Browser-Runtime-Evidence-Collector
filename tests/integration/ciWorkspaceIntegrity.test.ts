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

  it("builds and verifies the exact Chrome package before E2E smoke", async () => {
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    const job = jobBlock(workflow, "e2e-smoke");
    const restore = job.indexOf("- name: Restore canonical npm lockfile");
    const browserInstall = job.indexOf("- run: npx playwright install --with-deps chromium");
    const build = job.indexOf("- run: npm run build:chrome");
    const packageChrome = job.indexOf("- name: Package exact Chrome release artifact");
    const verifyPackage = job.indexOf("- name: Verify exact Chrome release artifact");
    const smoke = job.indexOf("- run: xvfb-run --auto-servernum npm run test:e2e:smoke");

    expect(restore).toBeGreaterThanOrEqual(0);
    expect(browserInstall).toBeGreaterThan(restore);
    expect(build).toBeGreaterThan(browserInstall);
    expect(packageChrome).toBeGreaterThan(build);
    expect(verifyPackage).toBeGreaterThan(packageChrome);
    expect(smoke).toBeGreaterThan(verifyPackage);

    const packageStep = job.slice(packageChrome, verifyPackage);
    expect(packageStep).toContain("node scripts/package-release.mjs --target chrome");
    const verificationStep = job.slice(verifyPackage, smoke);
    expect(verificationStep).toContain("metadata.version");
    expect(verificationStep).toContain(
      "artifacts/packages/edis-runtime-collector-chrome-${metadata.version}.zip",
    );
    expect(verificationStep).toContain("stat.isFile()");
    expect(verificationStep).toContain("stat.size === 0");
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
