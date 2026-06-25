import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import contract from "../e2e/browser-qualification-contract.json";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hex = "a".repeat(64);

interface QualificationResult {
  readonly status: string;
  readonly qualification_scope: string;
  readonly exact_chrome_qualified: boolean;
  readonly exact_edge_qualified: boolean;
  readonly required_target_test_executions: number;
  readonly suite_contract: { readonly expected_total: number };
  readonly target_results: {
    readonly chrome: { readonly status: string };
    readonly edge: { readonly status: string };
  };
}

describe("browser qualification aggregation contract", () => {
  it("accepts the current 32-test suite for both exact Stable browser targets", async () => {
    const temp = await makeTemp();
    try {
      await writeBrowserRun(temp.root, "chrome");
      await writeBrowserRun(temp.root, "edge");
      await runAggregator(temp.root, temp.output);
      const result = await readQualification(temp.output);
      expect(result.status).toBe("PASS");
      expect(result.suite_contract.expected_total).toBe(32);
      expect(result.exact_chrome_qualified).toBe(true);
      expect(result.exact_edge_qualified).toBe(true);
      expect(result.required_target_test_executions).toBe(64);
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("rejects a stale 29-test result as incomplete", async () => {
    const temp = await makeTemp();
    try {
      await writeBrowserRun(temp.root, "chrome", { tests: contract.tests.slice(0, 29) });
      await expect(runAggregator(temp.root, temp.output)).rejects.toThrow(
        /Missing browser test evidence/,
      );
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("detects missing browser tests", async () => {
    const temp = await makeTemp();
    try {
      await writeBrowserRun(temp.root, "edge", { tests: contract.tests.slice(1) });
      await expect(runAggregator(temp.root, temp.output)).rejects.toThrow(
        /Missing browser test evidence/,
      );
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("detects duplicate browser test identities", async () => {
    const temp = await makeTemp();
    try {
      const firstContractTest = contract.tests.at(0);
      if (!firstContractTest) throw new Error("Browser contract is empty.");
      await writeBrowserRun(temp.root, "chrome", { tests: [...contract.tests, firstContractTest] });
      await expect(runAggregator(temp.root, temp.output)).rejects.toThrow(
        /Duplicate browser test evidence/,
      );
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("detects unexpected browser test identities", async () => {
    const temp = await makeTemp();
    try {
      await writeBrowserRun(temp.root, "chrome", {
        tests: [
          ...contract.tests.slice(1),
          { file: "unexpected.spec.ts", title: "unexpected browser test" },
        ],
      });
      await expect(runAggregator(temp.root, temp.output)).rejects.toThrow(
        /Unexpected browser test evidence/,
      );
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("converts unavailable browser evidence into INSUFFICIENT_EVIDENCE, not PASS", async () => {
    const temp = await makeTemp();
    try {
      await writeUnavailable(temp.root, "chrome");
      await writeUnavailable(temp.root, "edge");
      await runAggregator(temp.root, temp.output);
      const result = await readQualification(temp.output);
      expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.qualification_scope).toBe("NO_BROWSER_RUNTIME_EVIDENCE");
      expect(result.exact_chrome_qualified).toBe(false);
      expect(result.exact_edge_qualified).toBe(false);
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });

  it("does not let a single browser run qualify both Chrome and Edge", async () => {
    const temp = await makeTemp();
    try {
      await writeBrowserRun(temp.root, "chrome");
      await runAggregator(temp.root, temp.output);
      const result = await readQualification(temp.output);
      expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.exact_chrome_qualified).toBe(true);
      expect(result.exact_edge_qualified).toBe(false);
      expect(result.target_results.edge.status).toBe("INSUFFICIENT_EVIDENCE");
    } finally {
      await rm(temp.base, { recursive: true, force: true });
    }
  });
});

async function makeTemp() {
  const base = await mkdtemp(path.join(os.tmpdir(), "edis-browser-agg-"));
  return { base, root: path.join(base, "root"), output: path.join(base, "out") };
}

async function runAggregator(root: string, output: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/aggregate-browser-qualification.mjs", root],
      { cwd: rootDir, env: { ...process.env, EDIS_BROWSER_QUALIFICATION_OUTPUT: output } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${stdout}\n${stderr}`));
        else resolve();
      },
    );
  });
}

async function readQualification(output: string): Promise<QualificationResult> {
  return JSON.parse(
    await readFile(path.join(output, "browser-qualification.json"), "utf8"),
  ) as QualificationResult;
}

async function writeBrowserRun(
  root: string,
  target: "chrome" | "edge",
  options: { tests?: Array<{ file: string; title: string }> } = {},
): Promise<void> {
  const dir = path.join(root, target);
  await mkdir(dir, { recursive: true });
  const tests = options.tests ?? contract.tests;
  await writeFile(
    path.join(dir, "environment.json"),
    `${JSON.stringify(environment(target), null, 2)}\n`,
  );
  await writeFile(
    path.join(dir, "playwright-results.json"),
    `${JSON.stringify(report(tests), null, 2)}\n`,
  );
}

async function writeUnavailable(root: string, target: "chrome" | "edge"): Promise<void> {
  const dir = path.join(root, target);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "environment-unavailable.json"),
    `${JSON.stringify(
      {
        schema_version: "1.1.0",
        status: "INSUFFICIENT_EVIDENCE",
        requested_target: target,
        reason: `No usable exact ${target} Stable executable was found.`,
        failure_boundary: "BROWSER_QUALIFICATION_FAILURE",
      },
      null,
      2,
    )}\n`,
  );
}

function environment(target: "chrome" | "edge") {
  const extensionId =
    target === "chrome" ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const family = target === "chrome" ? "chrome" : "edge";
  return {
    schema_version: "1.1.0",
    requested_target: target,
    browser_family: family,
    exact_requested_product: true,
    qualification_scope: target === "chrome" ? "EXACT_GOOGLE_CHROME" : "EXACT_MICROSOFT_EDGE",
    executable_source: `test:${target}`,
    executable_basename: target === "chrome" ? "chrome" : "msedge",
    executable_sha256: hex,
    browser_version_command:
      target === "chrome" ? "Google Chrome 149.0.0.0" : "Microsoft Edge 149.0.0.0",
    browser_runtime_version: "149.0.0.0",
    execution_mode: "headless_persistent_context",
    extension_target: target,
    extension_id: extensionId,
    service_worker_url: `chrome-extension://${extensionId}/background/service-worker.js`,
    extension_artifact_sha256: hex,
    extension_artifact_hash_profile: "EDIS-PACKAGED-ZIP-SHA256-1",
    extension_artifact_file_count: 50,
    extension_zip_sha256: hex,
    extension_zip_entry_count: 50,
    extension_zip_bytes: 1000,
    source_under_test: "exact_packaged_zip_extracted",
    indexeddb_name: "edis-runtime-collector",
    indexeddb_version: 4,
    schema_version_runtime_snapshot: "1.6.0",
    manifest_sha256: hex,
    manifest_version: "1.6.19",
    platform: "test",
    architecture: "x64",
    node: process.version,
    os: "TestOS 1.0",
  };
}

function report(tests: Array<{ file: string; title: string }>) {
  return {
    stats: { expected: tests.length, unexpected: 0, skipped: 0, flaky: 0, duration: 10 },
    suites: [
      {
        title: "browser qualification",
        specs: tests.map((item, index) => ({
          title: item.title,
          file: item.file,
          line: index + 1,
          ok: true,
          tests: [
            {
              status: "expected",
              expectedStatus: "passed",
              results: [{ status: "passed", duration: 1 }],
            },
          ],
        })),
      },
    ],
  };
}
