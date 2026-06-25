import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const output = path.resolve("artifacts/release-evidence");
await mkdir(output, { recursive: true });
const packageMetadata = await readJsonRequired("package.json");
const gate = await readJson("artifacts/release-gate/command-results.json");
const explicitNoBrowserGate = await readJson(
  "artifacts/release-gate/no-browser-command-results.json",
);
const noBrowserGate = explicitNoBrowserGate ?? (gate?.mode === "NO_BROWSER" ? gate : null);
const reproducibility = await readJson("artifacts/reproducibility/reproducibility.json");
const browserQualification = await readJson("artifacts/browser-e2e/browser-qualification.json");
const browserEnvironment =
  (await readJson("artifacts/browser-e2e/environment.json")) ??
  (await readJson("artifacts/browser-e2e/environment-unavailable.json")) ??
  browserQualification?.target_results?.chrome?.browser_evidence ??
  browserQualification?.target_results?.edge?.browser_evidence ??
  (await readFirstNamedJson("artifacts/browser-e2e", "environment-unavailable.json"));
const storedPlaywright =
  (await readJson("artifacts/browser-e2e/playwright-results.json")) ??
  (await readJson("artifacts/browser-e2e/chrome/playwright-results.json")) ??
  (await readJson("artifacts/browser-e2e/edge/playwright-results.json"));
const packageFiles = await inventoryDirectory("artifacts/packages");
const artifactIdentity = await releaseArtifactIdentity(packageMetadata.version);
const chromeManifest = await readJsonRequired("dist/chrome/manifest.json");
const edgeManifest = await readJsonRequired("dist/edge/manifest.json");
const browserTestInventory = listBrowserTests();
const unitCounts = await unitTestCounts(gate);
const fullGateStatus =
  gate?.mode === "NO_BROWSER"
    ? "NOT_RUN"
    : gate?.mode === "PARTIAL_TARGET"
      ? "PARTIAL"
      : gate?.exitCode === 0
        ? "PASSED"
        : gate?.exitCode === 2
          ? "UNAVAILABLE"
          : gate
            ? "FAILED"
            : "NOT_RUN";
const browserGateStep = gate?.commands?.find((item) => item.id?.startsWith("browser-e2e-"));
const playwright = browserGateStep && browserGateStep.exitCode !== 2 ? storedPlaywright : null;
const browserCounts = browserQualification
  ? {
      files: browserQualification.test_files ?? browserTestInventory.files,
      total: browserQualification.required_target_test_executions ?? browserTestInventory.total * 2,
      passed: browserQualification.passed ?? 0,
      failed: browserQualification.failed ?? 0,
      skipped: browserQualification.skipped ?? 0,
      unavailable: Math.max(
        0,
        (browserQualification.required_target_test_executions ?? browserTestInventory.total * 2) -
          (browserQualification.passed ?? 0),
      ),
    }
  : summarizePlaywright(playwright, browserTestInventory.total);
const noBrowserGateStatus =
  noBrowserGate?.exitCode === 0
    ? "PASSED"
    : noBrowserGate?.exitCode === 2
      ? "UNAVAILABLE"
      : noBrowserGate
        ? "FAILED"
        : "NOT_RUN";
const chromeBrowserReason = browserQualification?.target_results?.chrome?.reason ?? null;
const edgeBrowserReason = browserQualification?.target_results?.edge?.reason ?? null;
const browserUnavailableReason =
  browserEnvironment?.reason ?? chromeBrowserReason ?? edgeBrowserReason ?? null;
const browserStatus =
  browserQualification?.status === "PASS"
    ? "EXECUTED"
    : browserQualification?.status === "INSUFFICIENT_EVIDENCE" || browserUnavailableReason
      ? "UNAVAILABLE"
      : "NOT_RUN";
const exactChromeQualified = browserQualification?.exact_chrome_qualified === true;
const exactEdgeQualified = browserQualification?.exact_edge_qualified === true;
const automatedChromiumQualified = browserQualification?.automated_chromium_qualified === true;
const storeAdministrationStatus = {
  privacyPolicyPublicUrl: "REQUIRED",
  supportPublicUrl: "REQUIRED",
  developerContact: "REQUIRED",
  storeAccount: "REQUIRED",
  screenshotsAndPromotionalAssets: "REQUIRED",
  dashboardDeclarations: "REQUIRED",
};
const manualTestStatus = "NOT_RUN";
const runtimeStatuses = {
  runtimeDeterminism: statusForTests(playwright, ["runtime determinism semantic replay"]),
  workerRecovery: statusForTests(playwright, ["service-worker termination", "worker termination"]),
  navigationCancellation: statusForTests(playwright, ["navigation, reload"]),
  privacy: statusForTests(playwright, ["default runtime evidence excludes", "text-preview opt-in"]),
  networkIsolation: statusForTests(playwright, ["external network communication"]),
  accessibility: statusForFiles(playwright, ["accessibility.spec.ts"]),
  screenshotBehavior: statusForTests(playwright, ["screenshot disabled", "screenshot failure"]),
  evidencePackage: statusForTests(playwright, ["real exported package"]),
};
const technicalRequired = [
  fullGateStatus,
  reproducibility?.result === "PASS" ? "PASSED" : "FAILED",
  ...Object.values(runtimeStatuses),
];
const automatedReady = technicalRequired.every((value) => value === "PASSED");
const administrationReady = Object.values(storeAdministrationStatus).every(
  (value) => value === "COMPLETE",
);
const bothExactBrowsersQualified = exactChromeQualified && exactEdgeQualified;
const finalDecision =
  automatedReady &&
  bothExactBrowsersQualified &&
  manualTestStatus === "PASSED" &&
  administrationReady
    ? "READY_FOR_STORE_SUBMISSION"
    : automatedReady && !bothExactBrowsersQualified
      ? "NOT_READY_NO_BROWSER_RUNTIME_EVIDENCE"
      : automatedReady
        ? "CONDITIONALLY_READY_REQUIRES_MANUAL_GATES"
        : "NOT_READY";

const evidence = {
  schemaVersion: 1,
  projectVersion: packageMetadata.version,
  commitHash: gitCommit(),
  generatedAt: new Date().toISOString(),
  operatingSystem: `${os.type()} ${os.release()}`,
  architecture: process.arch,
  nodeVersion: process.version,
  packageManagerVersion: commandVersion("npm"),
  browserExecutable:
    browserEnvironment?.executable_path ?? browserEnvironment?.executablePath ?? null,
  browserVersion:
    browserEnvironment?.browser_version_command ?? browserEnvironment?.browserVersion ?? null,
  browserQualificationScope: browserQualification?.qualification_scope ?? null,
  exactChromeQualified,
  exactEdgeQualified,
  automatedChromiumQualified,
  browserQualificationSha256: browserQualification
    ? createHash("sha256")
        .update(await readFile("artifacts/browser-e2e/browser-qualification.json"))
        .digest("hex")
    : null,
  browserStatus,
  browserLimitationCode: bothExactBrowsersQualified ? null : "NO_BROWSER_RUNTIME_EVIDENCE",
  browserUnavailableReason,
  chromeBrowserReason,
  edgeBrowserReason,
  browserTestsExecuted: browserQualification?.passed ?? 0,
  fullTwoTargetBrowserQualification: browserQualification?.full_release_gate_passed === true,
  commandsExecuted: gate?.commands ?? [],
  noBrowserCommandsExecuted: noBrowserGate?.commands ?? [],
  commandGateResults: {
    fullTwoTargetGate: fullGateStatus,
    noBrowserGate: noBrowserGateStatus,
    fullTwoTargetExitCode: gate?.exitCode ?? null,
    noBrowserExitCode: noBrowserGate?.exitCode ?? null,
  },
  testCounts: {
    repository: unitCounts,
    browser: browserCounts,
  },
  passedTests: playwright ? browserTestNames(playwright, "passed") : [],
  failedTests: playwright ? browserTestNames(playwright, "failed") : [],
  skippedTests: playwright ? browserTestNames(playwright, "skipped") : [],
  unavailableTests: browserQualification?.status === "PASS" ? [] : browserTestInventory.names,
  buildArtifacts: packageFiles,
  releaseArtifactIntegrity: artifactIdentity,
  sourceEntryCount: artifactIdentity.source?.entry_count ?? null,
  buildEntryCounts: {
    chrome: artifactIdentity.chrome?.entry_count ?? null,
    edge: artifactIdentity.edge?.entry_count ?? null,
  },
  zipSha256Values: {
    source: artifactIdentity.source?.sha256 ?? null,
    chrome: artifactIdentity.chrome?.sha256 ?? null,
    edge: artifactIdentity.edge?.sha256 ?? null,
  },
  manifestSha256Values: {
    chrome: artifactIdentity.chrome?.manifest_sha256 ?? null,
    edge: artifactIdentity.edge?.manifest_sha256 ?? null,
  },
  artifactIdentityStatus: artifactIdentity.status,
  productionFileCounts: {
    chrome: await countFiles("dist/chrome"),
    edge: await countFiles("dist/edge"),
  },
  permissions: {
    chrome: chromeManifest.permissions ?? [],
    edge: edgeManifest.permissions ?? [],
  },
  contentSecurityPolicy: {
    chrome: chromeManifest.content_security_policy ?? null,
    edge: edgeManifest.content_security_policy ?? null,
  },
  reproducibilityResult: reproducibility?.result ?? "UNAVAILABLE",
  reproducibilityFileCounts: {
    first: reproducibility?.firstFileCount ?? null,
    second: reproducibility?.secondFileCount ?? null,
    mismatches: reproducibility?.mismatches?.length ?? null,
  },
  productionBuildResult: gateStepStatus(gate, "production-build"),
  packageValidationResult: gateStepStatus(gate, "package-validation"),
  schemaValidationResult: gateStepStatus(gate, "schema-validation"),
  storeDocumentValidationResult: gateStepStatus(gate, "store-document-validation"),
  dependencyAuditResult: gateStepStatus(gate, "production-dependency-audit"),
  runtimeDeterminismResult: runtimeStatuses.runtimeDeterminism,
  workerRecoveryResult: runtimeStatuses.workerRecovery,
  navigationResult: runtimeStatuses.navigationCancellation,
  privacyResult: runtimeStatuses.privacy,
  networkIsolationResult: runtimeStatuses.networkIsolation,
  accessibilityResult: runtimeStatuses.accessibility,
  screenshotResult: runtimeStatuses.screenshotBehavior,
  evidencePackageResult: runtimeStatuses.evidencePackage,
  manualTestStatus,
  storeAdministrationStatus,
  finalDecision,
};
await writeFile(
  path.join(output, "release-evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await writeFile(path.join(output, "release-evidence.md"), renderMarkdown(evidence));
console.log(`Release evidence generated with decision ${finalDecision}.`);

async function releaseArtifactIdentity(version) {
  const artifacts = {};
  for (const target of ["source", "chrome", "edge"]) {
    const filename =
      target === "source"
        ? `edis-runtime-collector-source-${version}.zip`
        : `edis-runtime-collector-${target}-${version}.zip`;
    const file = path.join("artifacts/packages", filename);
    try {
      const bytes = await readFile(file);
      const entries = parseStoreZip(new Uint8Array(bytes));
      const manifestBytes = entries.get("manifest.json") ?? null;
      artifacts[target] = {
        path: file.replaceAll(path.sep, "/"),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        entry_count: entries.size,
        manifest_sha256: manifestBytes
          ? createHash("sha256").update(manifestBytes).digest("hex")
          : null,
      };
    } catch (error) {
      artifacts[target] = {
        path: file.replaceAll(path.sep, "/"),
        status: "INSUFFICIENT_EVIDENCE",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    status: Object.values(artifacts).every((item) => typeof item.sha256 === "string")
      ? "PASS"
      : "INSUFFICIENT_EVIDENCE",
    ...artifacts,
  };
}

function parseStoreZip(bytes) {
  const output = new Map();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const signature = view.getUint32(0, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`Unexpected ZIP signature at ${offset}.`);
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    if ((flags & 0x0008) !== 0 || method !== 0)
      throw new Error("ZIP must use stored entries without data descriptors.");
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    if (compressedSize !== uncompressedSize) throw new Error("Stored ZIP size mismatch.");
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (dataEnd > bytes.length) throw new Error("Truncated ZIP entry.");
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (output.has(name)) throw new Error(`Duplicate ZIP path: ${name}`);
    output.set(name, bytes.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  if (output.size === 0) throw new Error("ZIP contains no entries.");
  return output;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}
async function readFirstNamedJson(directory, name) {
  const files = await findNamedFiles(directory, name);
  for (const file of files) {
    const value = await readJson(file);
    if (value) return value;
  }
  return null;
}
async function readJsonRequired(file) {
  const value = await readJson(file);
  if (!value) throw new Error(`Required JSON is unavailable: ${file}`);
  return value;
}
async function findNamedFiles(directory, name) {
  const results = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await findNamedFiles(absolute, name)));
    else if (entry.isFile() && entry.name === name) results.push(absolute);
  }
  return results.sort();
}
async function inventoryDirectory(directory) {
  const result = [];
  try {
    for (const file of await walk(directory)) {
      const data = await readFile(file);
      result.push({
        path: path.relative(directory, file).replaceAll(path.sep, "/"),
        bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    }
  } catch {
    return [];
  }
  return result;
}
async function walk(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(target)));
    else result.push(target);
  }
  return result.sort();
}
async function countFiles(root) {
  try {
    return (await walk(root)).length;
  } catch {
    return 0;
  }
}
function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
function commandVersion(command) {
  try {
    return execFileSync(command, ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}
function listBrowserTests() {
  const result = spawnSync("npx", ["playwright", "test", "--list", "--reporter=line"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) return { total: 0, names: [], files: 0 };
  const names = result.stdout
    .split("\n")
    .filter((line) => /^\s+\S+\.spec\.ts:\d+:\d+ › /.test(line))
    .map((line) => line.replace(/^\s+\S+\.spec\.ts:\d+:\d+ › /, "").trim());
  const files = new Set(
    result.stdout
      .split("\n")
      .filter((line) => /^\s+\S+\.spec\.ts:\d+:\d+ › /.test(line))
      .map((line) => line.trim().split(":", 1)[0]),
  ).size;
  return { total: names.length, names, files };
}
async function unitTestCounts(gateReport) {
  const step = gateReport?.commands?.find((item) => item.id === "repository-test-verify");
  const directReportAvailable = await readJson(
    "artifacts/release-gate/repository-tests-results.json",
  );
  if (!step && !directReportAvailable)
    return { files: 0, passed: 0, failed: 0, skipped: 0, unavailable: 1 };
  const ids = ["unit-tests", "security-tests", "integration-tests"];
  let files = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  try {
    for (const id of ids) {
      const report = await readJson(`artifacts/release-gate/${id}-results.json`);
      if (!report || report.success !== true) throw new Error(`Missing passing report for ${id}.`);
      files += Array.isArray(report.testResults) ? report.testResults.length : 0;
      passed += Number(report.numPassedTests ?? 0);
      failed += Number(report.numFailedTests ?? 0);
      skipped += Number(report.numPendingTests ?? 0) + Number(report.numTodoTests ?? 0);
    }
    return { files, passed, failed, skipped, unavailable: 0 };
  } catch {
    return { files: 0, passed: 0, failed: 0, skipped: 0, unavailable: 1 };
  }
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
}
function summarizePlaywright(report, expectedTotal) {
  if (!report?.suites)
    return {
      files: browserTestInventory.files,
      total: expectedTotal,
      passed: 0,
      failed: 0,
      skipped: 0,
      unavailable: expectedTotal,
    };
  const names = browserTestRecords(report);
  return {
    files: new Set(names.map((item) => item.file).filter(Boolean)).size,
    total: names.length,
    passed: names.filter((item) => item.status === "passed").length,
    failed: names.filter((item) => item.status === "failed").length,
    skipped: names.filter((item) => item.status === "skipped").length,
    unavailable: 0,
  };
}
function browserTestRecords(report) {
  const output = [];
  const visit = (suite, parent = "") => {
    const prefix = [parent, suite.title].filter(Boolean).join(" › ");
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        output.push({
          name: [prefix, spec.title].filter(Boolean).join(" › "),
          status: test.results?.at(-1)?.status ?? "failed",
          file: spec.file ?? null,
        });
    for (const child of suite.suites ?? []) visit(child, prefix);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return output;
}
function browserTestNames(report, status) {
  return browserTestRecords(report)
    .filter((item) => item.status === status)
    .map((item) => item.name);
}
function statusForTests(report, phrases) {
  if (!report?.suites) return "UNAVAILABLE";
  const records = browserTestRecords(report).filter((item) =>
    phrases.some((phrase) => item.name.toLowerCase().includes(phrase.toLowerCase())),
  );
  if (records.length === 0) return "NOT_RUN";
  return records.every((item) => item.status === "passed") ? "PASSED" : "FAILED";
}
function statusForFiles(report, fileNames) {
  if (!report?.suites) return "UNAVAILABLE";
  const records = browserTestRecords(report).filter((item) =>
    fileNames.some((name) => item.file?.endsWith(name)),
  );
  if (records.length === 0) return "NOT_RUN";
  return records.every((item) => item.status === "passed") ? "PASSED" : "FAILED";
}
function gateStepStatus(report, id) {
  const step = report?.commands?.find((item) => item.id === id);
  if (!step) return "NOT_RUN";
  return step.exitCode === 0 ? "PASSED" : step.exitCode === 2 ? "UNAVAILABLE" : "FAILED";
}
function renderMarkdown(value) {
  const commands = value.commandsExecuted
    .map((item) => `| ${item.id} | \`${item.command} ${item.args.join(" ")}\` | ${item.exitCode} |`)
    .join("\n");
  return `# EDIS Runtime Collector Release Evidence

- Project version: ${value.projectVersion}
- Generated: ${value.generatedAt}
- Operating system: ${value.operatingSystem}
- Node: ${value.nodeVersion}
- npm: ${value.packageManagerVersion}
- Browser limitation code: **${value.browserLimitationCode ?? "NONE"}**
- Browser executable: ${value.browserExecutable ?? "unavailable"}
- Browser version: ${value.browserVersion ?? "unavailable"}
- Full two-target gate: **${value.commandGateResults.fullTwoTargetGate}**
- No-browser gate: **${value.commandGateResults.noBrowserGate}**
- Browser tests executed: **${value.browserTestsExecuted}**
- Browser tests unavailable: **${value.testCounts.browser.unavailable} of ${value.testCounts.browser.total}**
- Exact Chrome qualified: **${value.exactChromeQualified ? "true" : "false"}**
- Exact Edge qualified: **${value.exactEdgeQualified ? "true" : "false"}**
- Chrome limitation reason: ${value.chromeBrowserReason ?? "none"}
- Edge limitation reason: ${value.edgeBrowserReason ?? "none"}
- Repository tests: **${value.testCounts.repository.passed} passed**
- Reproducibility: **${value.reproducibilityResult}**
- Runtime determinism: **${value.runtimeDeterminismResult}**
- Worker recovery: **${value.workerRecoveryResult}**
- Navigation: **${value.navigationResult}**
- Privacy: **${value.privacyResult}**
- Network isolation: **${value.networkIsolationResult}**
- Accessibility: **${value.accessibilityResult}**
- Manual compatibility: **${value.manualTestStatus}**
- Final release recommendation: **${value.finalDecision}**

## Full-gate commands

| Gate | Command | Exit code |
|---|---|---:|
${commands}

## Browser limitation

${value.browserLimitationCode ?? "NONE"}: ${value.browserUnavailableReason ?? "None recorded."}
`;
}
