import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
const projectConfig = JSON.parse(await readFile("project.config.json", "utf8"));
const version = packageMetadata.version;
const browserContract = JSON.parse(
  await readFile("tests/e2e/browser-qualification-contract.json", "utf8"),
);
const expectedBrowserTestsPerTarget = browserContract.expected_total;
const expectedBrowserTargetCount = Array.isArray(projectConfig.productionTargets)
  ? projectConfig.productionTargets.length
  : 2;
const browserQualificationPath = `artifacts/browser-e2e-${version}/browser-qualification.json`;
const commandRoot = path.resolve("artifacts/personal-release-evidence");
const requiredCommands = [
  "typecheck",
  "lint",
  "format",
  "schemas",
  "build",
  "package-validation",
  "reproducibility",
  "audit",
  "performance",
];
const commands = [];
let commandEvidenceComplete = true;
for (const id of requiredCommands) {
  try {
    const rc = Number((await readFile(path.join(commandRoot, `${id}.rc`), "utf8")).trim());
    const log = await readFile(path.join(commandRoot, `${id}.log`));
    if (rc !== 0) throw new Error(`Personal release command failed: ${id}`);
    commands.push({
      id,
      status: "PASS",
      exit_code: rc,
      log_bytes: log.length,
      log_sha256: sha256(log),
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    commandEvidenceComplete = false;
    commands.push({
      id,
      status: "NOT_RUN",
      exit_code: null,
      log_bytes: 0,
      log_sha256: null,
      reason: `Missing personal command evidence under ${path.relative(process.cwd(), commandRoot)}.`,
    });
  }
}

const repository = JSON.parse(
  await readFile("artifacts/release-gate/repository-tests-results.json", "utf8"),
);
if (
  repository.success !== true ||
  repository.numTotalTests < 1 ||
  repository.numPassedTests !== repository.numTotalTests ||
  repository.numFailedTests !== 0 ||
  repository.numPendingTests !== 0 ||
  repository.numTodoTests !== 0
)
  throw new Error("Repository test evidence is incomplete or failed.");
const runner = JSON.parse(
  await readFile("artifacts/release-gate/repository-tests-runner.json", "utf8"),
);
if (
  runner.report_complete !== true ||
  runner.report_passed !== true ||
  runner.failure_reason !== null
)
  throw new Error("Repository test runner evidence is incomplete or failed.");

const browser = JSON.parse(await readFile(browserQualificationPath, "utf8"));
const browserAvailable = browser.status === "PASS";
if (
  browserAvailable &&
  (browser.tests !== expectedBrowserTestsPerTarget * expectedBrowserTargetCount ||
    browser.passed !== expectedBrowserTestsPerTarget * expectedBrowserTargetCount ||
    browser.failed !== 0 ||
    browser.skipped !== 0 ||
    browser.flaky !== 0 ||
    typeof browser.qualification_scope !== "string" ||
    browser.browser_evidence === null ||
    typeof browser.browser_evidence !== "object" ||
    browser.exact_chrome_qualified !== true ||
    browser.exact_edge_qualified !== true ||
    browser.full_release_gate_passed !== true ||
    browser.browser === "unknown" ||
    !/^[0-9a-f]{64}$/.test(browser.browser_evidence.executable_sha256 ?? "") ||
    !/^[0-9a-f]{64}$/.test(browser.browser_evidence.extension_artifact_sha256 ?? "") ||
    !/^[0-9a-f]{64}$/.test(browser.browser_evidence.manifest_sha256 ?? ""))
)
  throw new Error("Browser qualification evidence is incomplete or failed.");
if (!browserAvailable && browser.status !== "INSUFFICIENT_EVIDENCE")
  throw new Error("Browser qualification status is neither PASS nor INSUFFICIENT_EVIDENCE.");

const reproducibility = JSON.parse(
  await readFile("artifacts/reproducibility/reproducibility.json", "utf8"),
);
if (reproducibility.result !== "PASS" || reproducibility.mismatches.length !== 0)
  throw new Error("Reproducible build evidence failed.");

let performance = null;
try {
  performance = JSON.parse(
    await readFile("artifacts/personal-performance/personal-performance.json", "utf8"),
  );
  if (
    performance.status !== "PASS" ||
    performance.projectVersion !== version ||
    performance.repositoryTests?.passed !== repository.numTotalTests
  )
    throw new Error("Personal performance evidence is incomplete.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  commandEvidenceComplete = false;
  performance = {
    status: "NOT_RUN",
    reason: "Missing artifacts/personal-performance/personal-performance.json.",
  };
}

const packages = [];
for (const target of ["chrome", "edge"]) {
  const manifest = JSON.parse(await readFile(path.join("dist", target, "manifest.json"), "utf8"));
  if (manifest.version !== version) throw new Error(`${target} manifest version mismatch.`);
  const packagePath = path.resolve(
    "artifacts/packages",
    `edis-runtime-collector-${target}-${version}.zip`,
  );
  const bytes = await readFile(packagePath);
  packages.push({ target, bytes: bytes.length, sha256: sha256(bytes) });
}

const output = {
  schema_version: "1.0.0",
  extension_version: version,
  profile: "PERSONAL_UNPACKED_STABILITY_AND_PERFORMANCE",
  status: commandEvidenceComplete
    ? browserAvailable
      ? "PASS"
      : "PASS_WITH_BROWSER_RUNTIME_INSUFFICIENT_EVIDENCE"
    : "INSUFFICIENT_EVIDENCE",
  store_publication_required: false,
  runtime_schema_version: projectConfig.schemaVersion,
  commands,
  repository_tests: {
    files: repository.testResults.length,
    expected_from_report: "derived_from_repository_results",
    tests: repository.numTotalTests,
    passed: repository.numPassedTests,
    failed: repository.numFailedTests,
    skipped: repository.numPendingTests,
    report_sha256: sha256(await readFile("artifacts/release-gate/repository-tests-results.json")),
  },
  browser_qualification: {
    status: browser.status,
    browser: browser.browser ?? null,
    qualification_scope: browser.qualification_scope ?? null,
    exact_chrome_qualified: browser.exact_chrome_qualified ?? false,
    exact_edge_qualified: browser.exact_edge_qualified ?? false,
    automated_chromium_qualified: browser.automated_chromium_qualified ?? false,
    browser_evidence: browser.browser_evidence ?? null,
    expected_contract_per_target: expectedBrowserTestsPerTarget,
    required_target_count: expectedBrowserTargetCount,
    expected_required_executions: expectedBrowserTestsPerTarget * expectedBrowserTargetCount,
    files: browser.test_files ?? 0,
    tests: browser.tests ?? 0,
    passed: browser.passed ?? 0,
    failed: browser.failed ?? 0,
    skipped: browser.skipped ?? 0,
    flaky: browser.flaky ?? 0,
    report_sha256: sha256(await readFile(browserQualificationPath)),
  },
  reproducibility: {
    result: reproducibility.result,
    first_file_count: reproducibility.firstFileCount,
    second_file_count: reproducibility.secondFileCount,
    mismatches: reproducibility.mismatches.length,
  },
  performance,
  production_packages: packages,
  limitations: [
    "Microsoft Edge package was built and validated but not executed in this qualification run.",
    "WordPress 7 visibility is verified by a controlled synthetic runtime fixture; real WordPress/Elementor fixtures remain insufficient_evidence.",
    "Performance durations are environment observations and are not portable cross-machine thresholds.",
    ...(commandEvidenceComplete
      ? []
      : ["Personal command rc/log evidence was not present, so this audit is informational only."]),
  ],
};
const root = path.resolve("artifacts/personal-release-audit");
await mkdir(root, { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(path.join(root, "personal-release-audit.json"), serialized, "utf8");
await writeFile(
  path.join(root, "personal-release-audit.sha256"),
  `${sha256(Buffer.from(serialized))}  personal-release-audit.json\n`,
  "utf8",
);
console.log(
  `Personal release audit: ${output.status} (${output.repository_tests.tests} repository tests, ${output.browser_qualification.tests}/${output.browser_qualification.expected_required_executions} browser target-test executions).`,
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
