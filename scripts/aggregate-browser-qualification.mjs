import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const root = path.resolve(process.argv[2] ?? `artifacts/browser-e2e-${version}`);
const outputRoot = path.resolve(process.env.EDIS_BROWSER_QUALIFICATION_OUTPUT ?? root);
const contractPath = path.resolve("tests/e2e/browser-qualification-contract.json");
const contract = await readContract(contractPath);
const contractIds = new Set(contract.tests.map(testIdentity));
const expectedByFile = new Map(Object.entries(contract.expected_files));
const requiredTargets = ["chrome", "edge"];

const reportPaths = await findNamedFiles(root, "playwright-results.json");
if (reportPaths.length === 0) {
  const unavailableEvidence = await readUnavailableEvidence(root);
  const targetResults = Object.fromEntries(
    requiredTargets.map((target) => [
      target,
      unavailableTargetResult(
        target,
        unavailableEvidence.filter((item) => item.evidence?.requested_target === target),
      ),
    ]),
  );
  const output = baseOutput({
    status: "INSUFFICIENT_EVIDENCE",
    qualification_scope: "NO_BROWSER_RUNTIME_EVIDENCE",
    exact_chrome_qualified: false,
    exact_edge_qualified: false,
    automated_chromium_qualified: false,
    target_results: targetResults,
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    reports: [],
    environments: [],
    test_evidence: [],
    insufficient_evidence: unavailableEvidence,
    limitations: browserLimitations(targetResults),
    runtime_scenarios: [],
  });
  await writeQualification(output);
  console.log("Browser qualification: insufficient evidence (no executable runtime report). ");
  process.exit(0);
}

const collectedByTarget = new Map();
const reports = [];
const environmentRecords = [];
for (const reportPath of reportPaths) {
  const environmentPath = await findNearestEnvironment(reportPath, root);
  if (!environmentPath) throw new Error(`No environment.json provenance for ${reportPath}.`);
  const environmentBytes = await readFile(environmentPath);
  const environment = JSON.parse(environmentBytes.toString("utf8"));
  validateEnvironment(environment, environmentPath);
  const target = environment.requested_target;
  if (!requiredTargets.includes(target)) throw new Error(`Unexpected browser target: ${target}`);

  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString("utf8"));
  const stats = report.stats ?? {};
  if (stats.unexpected !== 0 || stats.skipped !== 0 || stats.flaky !== 0)
    throw new Error(`Browser report is not clean: ${reportPath}`);
  const tests = [];
  let reportTestCount = 0;
  for (const suite of report.suites ?? []) collectSuite(suite, tests, () => (reportTestCount += 1));
  if (Number.isInteger(stats.expected) && reportTestCount !== stats.expected)
    throw new Error(`Browser report count mismatch: ${reportPath}`);

  if (!collectedByTarget.has(target)) collectedByTarget.set(target, []);
  collectedByTarget.get(target).push({ environment, environmentPath, tests, reportPath });
  const environmentHash = sha256(environmentBytes);
  reports.push({
    path: relative(reportPath),
    sha256: sha256(reportBytes),
    environment_sha256: environmentHash,
    requested_target: target,
    expected: stats.expected ?? reportTestCount,
    duration_ms: Math.round(stats.duration ?? 0),
  });
  environmentRecords.push({
    path: relative(environmentPath),
    sha256: environmentHash,
    evidence: environment,
  });
}

const targetResults = {};
for (const target of requiredTargets) {
  const shards = collectedByTarget.get(target) ?? [];
  targetResults[target] = validateTargetEvidence(target, shards);
}

const exactChromeQualified = targetResults.chrome?.exact_qualified === true;
const exactEdgeQualified = targetResults.edge?.exact_qualified === true;
const fullQualified = exactChromeQualified && exactEdgeQualified;
const allTests = Object.values(targetResults).flatMap((result) => result.test_evidence ?? []);
const firstPassed = Object.values(targetResults).find((result) => result.status === "PASS");
const output = baseOutput({
  status: fullQualified ? "PASS" : "INSUFFICIENT_EVIDENCE",
  qualification_scope: fullQualified
    ? "FULL_EXACT_STABLE_TARGETS"
    : "PARTIAL_OR_MISSING_BROWSER_RUNTIME_EVIDENCE",
  exact_chrome_qualified: exactChromeQualified,
  exact_edge_qualified: exactEdgeQualified,
  automated_chromium_qualified: Object.values(targetResults).some(
    (result) => result.qualification_scope === "AUTOMATED_PLAYWRIGHT_CHROMIUM",
  ),
  browser: fullQualified
    ? "Google Chrome Stable + Microsoft Edge Stable"
    : (firstPassed?.browser ?? null),
  browser_evidence: firstPassed?.browser_evidence ?? null,
  execution_mode: firstPassed?.execution_mode ?? null,
  target_results: targetResults,
  tests: allTests.length,
  passed: allTests.length,
  failed: 0,
  skipped: 0,
  flaky: 0,
  reports: reports.sort((a, b) => a.path.localeCompare(b.path)),
  environments: environmentRecords
    .map(({ path: environmentPath, sha256: hash, evidence }) => ({
      path: environmentPath,
      sha256: hash,
      requested_target: evidence.requested_target,
      qualification_scope: evidence.qualification_scope,
    }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  test_evidence: allTests.sort((a, b) =>
    `${a.requested_target}:${a.file}:${a.title}`.localeCompare(
      `${b.requested_target}:${b.file}:${b.title}`,
    ),
  ),
  insufficient_evidence: await readUnavailableEvidence(root),
  limitations: browserLimitations(targetResults),
  runtime_scenarios: await collectRuntimeScenarios(root),
});
await writeQualification(output);
console.log(
  `Browser qualification: ${output.status} (${output.passed}/${requiredTargets.length * contract.expected_total} required target-test executions).`,
);

function validateTargetEvidence(target, shards) {
  if (shards.length === 0)
    return {
      status: "INSUFFICIENT_EVIDENCE",
      requested_target: target,
      exact_qualified: false,
      reason: `No ${target} Playwright runtime report was supplied to the browser qualification aggregator.`,
      failure_boundary: "BROWSER_QUALIFICATION_FAILURE",
      expected_tests: contract.expected_total,
      tests: 0,
      missing_tests: contract.tests,
      duplicate_tests: [],
      unexpected_tests: [],
      test_evidence: [],
    };

  const identity = stableRuntimeIdentity(shards[0].environment);
  for (const shard of shards.slice(1)) {
    if (stableRuntimeIdentity(shard.environment) !== identity)
      throw new Error(
        `Browser shards for ${target} were executed with inconsistent runtime identity evidence.`,
      );
  }

  const unique = new Map();
  const duplicates = [];
  const unexpected = [];
  for (const shard of shards) {
    for (const item of shard.tests) {
      const id = testIdentity(item);
      const enriched = { ...item, requested_target: target };
      if (unique.has(id)) duplicates.push(enriched);
      else unique.set(id, enriched);
      if (!contractIds.has(id)) unexpected.push(enriched);
    }
  }
  const missing = contract.tests.filter((item) => !unique.has(testIdentity(item)));
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate browser test evidence for ${target}: ${testIdentity(duplicates[0])}`,
    );
  if (unexpected.length > 0)
    throw new Error(
      `Unexpected browser test evidence for ${target}: ${testIdentity(unexpected[0])}`,
    );
  if (missing.length > 0)
    throw new Error(`Missing browser test evidence for ${target}: ${testIdentity(missing[0])}`);
  if (unique.size !== contract.expected_total)
    throw new Error(
      `Expected ${contract.expected_total} browser tests for ${target}, found ${unique.size}.`,
    );

  const counts = new Map();
  for (const item of unique.values()) counts.set(item.file, (counts.get(item.file) ?? 0) + 1);
  for (const [file, expected] of expectedByFile) {
    if ((counts.get(file) ?? 0) !== expected)
      throw new Error(
        `Expected ${expected} browser tests for ${target}/${file}, found ${counts.get(file) ?? 0}.`,
      );
  }
  for (const file of counts.keys())
    if (!expectedByFile.has(file)) throw new Error(`Unexpected test file: ${file}`);

  const primary = shards[0].environment;
  const exactQualified =
    (target === "chrome" && primary.qualification_scope === "EXACT_GOOGLE_CHROME") ||
    (target === "edge" && primary.qualification_scope === "EXACT_MICROSOFT_EDGE");
  if (!exactQualified)
    return {
      status: "INSUFFICIENT_EVIDENCE",
      requested_target: target,
      exact_qualified: false,
      qualification_scope: primary.qualification_scope,
      reason: `${target} evidence was executed, but not on the exact required Stable product.`,
      failure_boundary: "BROWSER_QUALIFICATION_FAILURE",
      expected_tests: contract.expected_total,
      tests: unique.size,
      passed: unique.size,
      missing_tests: [],
      duplicate_tests: [],
      unexpected_tests: [],
      test_evidence: [...unique.values()],
      browser: primary.browser_version_command,
      browser_evidence: browserEvidence(primary),
      execution_mode: primary.execution_mode,
    };

  return {
    status: "PASS",
    requested_target: target,
    exact_qualified: true,
    qualification_scope: primary.qualification_scope,
    browser: primary.browser_version_command,
    browser_evidence: browserEvidence(primary),
    execution_mode: primary.execution_mode,
    expected_tests: contract.expected_total,
    tests: unique.size,
    passed: unique.size,
    missing_tests: [],
    duplicate_tests: [],
    unexpected_tests: [],
    counts_by_file: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
    test_evidence: [...unique.values()].sort((a, b) =>
      `${a.file}:${a.title}`.localeCompare(`${b.file}:${b.title}`),
    ),
  };
}

function baseOutput(overrides) {
  return {
    schema_version: "1.2.0",
    extension_version: version,
    suite_contract: {
      path: relativeToProcess(contractPath),
      sha256: contract.sha256,
      expected_total: contract.expected_total,
      expected_files: contract.expected_files,
      required_targets: requiredTargets,
    },
    full_release_gate_required_targets: requiredTargets,
    full_release_gate_passed: false,
    test_files: Object.keys(contract.expected_files).length,
    contract_tests_per_target: contract.expected_total,
    required_target_test_executions: requiredTargets.length * contract.expected_total,
    ...overrides,
  };
}

function unavailableTargetResult(target, unavailable) {
  const evidence = unavailable[0]?.evidence ?? null;
  return {
    status: "INSUFFICIENT_EVIDENCE",
    requested_target: target,
    exact_qualified: false,
    reason:
      evidence?.reason ??
      `No ${target} runtime evidence was found. Exact packaged ${target} artifact has not been qualified on Stable browser.`,
    failure_boundary: evidence?.failure_boundary ?? "BROWSER_QUALIFICATION_FAILURE",
    expected_tests: contract.expected_total,
    tests: 0,
    missing_tests: contract.tests,
    unavailable_evidence: unavailable.map(({ path, sha256 }) => ({ path, sha256 })),
    test_evidence: [],
  };
}

function browserLimitations(targetResults) {
  const limitations = [];
  if (!targetResults.chrome?.exact_qualified || !targetResults.edge?.exact_qualified)
    limitations.push(
      "NO_BROWSER_RUNTIME_EVIDENCE: both exact Chrome Stable and exact Microsoft Edge Stable packaged-artifact qualifications must pass before release is GO.",
    );
  for (const target of requiredTargets) {
    const result = targetResults[target];
    if (result?.status !== "PASS")
      limitations.push(`${target}: ${result?.reason ?? "missing exact Stable runtime evidence"}`);
  }
  limitations.push(
    "A single browser target run is partial qualification only and cannot qualify both production targets.",
  );
  return limitations;
}

function browserEvidence(primary) {
  return {
    requested_target: primary.requested_target,
    browser_family: primary.browser_family,
    executable_source: primary.executable_source,
    executable_basename: primary.executable_basename,
    executable_sha256: primary.executable_sha256,
    browser_version_command: primary.browser_version_command,
    browser_runtime_version: primary.browser_runtime_version,
    extension_target: primary.extension_target,
    extension_artifact_sha256: primary.extension_artifact_sha256,
    extension_artifact_hash_profile: primary.extension_artifact_hash_profile,
    extension_artifact_file_count: primary.extension_artifact_file_count,
    extension_zip_sha256: primary.extension_zip_sha256,
    extension_zip_entry_count: primary.extension_zip_entry_count ?? null,
    extension_zip_bytes: primary.extension_zip_bytes ?? null,
    source_under_test: primary.source_under_test,
    indexeddb_name: primary.indexeddb_name,
    indexeddb_version: primary.indexeddb_version ?? null,
    schema_version_runtime_snapshot: primary.schema_version_runtime_snapshot ?? null,
    manifest_sha256: primary.manifest_sha256,
    manifest_version: primary.manifest_version,
    extension_id: primary.extension_id,
    service_worker_url: primary.service_worker_url,
    platform: primary.platform,
    architecture: primary.architecture,
    node: primary.node,
    os: primary.os,
  };
}

async function readContract(file) {
  const bytes = await readFile(file);
  const value = JSON.parse(bytes.toString("utf8"));
  if (value.schema_version !== "1.0.0")
    throw new Error(`Unsupported browser suite contract: ${file}`);
  if (!Number.isInteger(value.expected_total) || value.expected_total < 1)
    throw new Error(`Invalid browser suite expected_total: ${file}`);
  if (!value.expected_files || typeof value.expected_files !== "object")
    throw new Error(`Invalid browser suite expected_files: ${file}`);
  if (!Array.isArray(value.tests) || value.tests.length !== value.expected_total)
    throw new Error(`Browser suite contract test list does not match expected_total: ${file}`);
  const ids = new Set();
  for (const item of value.tests) {
    if (typeof item.file !== "string" || typeof item.title !== "string")
      throw new Error(`Invalid browser suite contract test identity: ${file}`);
    const id = testIdentity(item);
    if (ids.has(id)) throw new Error(`Duplicate browser suite contract identity: ${id}`);
    ids.add(id);
  }
  const counts = {};
  for (const item of value.tests) counts[item.file] = (counts[item.file] ?? 0) + 1;
  if (JSON.stringify(counts) !== JSON.stringify(value.expected_files))
    throw new Error(`Browser suite expected_files do not match test identities: ${file}`);
  return { ...value, sha256: sha256(bytes) };
}

async function readUnavailableEvidence(directory) {
  const unavailablePaths = await findNamedFiles(directory, "environment-unavailable.json");
  const unavailable = [];
  for (const unavailablePath of unavailablePaths) {
    const unavailableBytes = await readFile(unavailablePath);
    unavailable.push({
      path: relative(unavailablePath),
      sha256: sha256(unavailableBytes),
      evidence: JSON.parse(unavailableBytes.toString("utf8")),
    });
  }
  return unavailable.sort((a, b) => a.path.localeCompare(b.path));
}

function validateEnvironment(value, sourcePath) {
  const hex = /^[0-9a-f]{64}$/;
  const requiredStrings = [
    "schema_version",
    "requested_target",
    "browser_family",
    "qualification_scope",
    "executable_source",
    "executable_basename",
    "executable_sha256",
    "browser_version_command",
    "browser_runtime_version",
    "execution_mode",
    "extension_target",
    "extension_id",
    "service_worker_url",
    "extension_artifact_sha256",
    "extension_artifact_hash_profile",
    "extension_zip_sha256",
    "source_under_test",
    "indexeddb_name",
    "manifest_sha256",
    "manifest_version",
    "platform",
    "architecture",
    "node",
    "os",
  ];
  if (!value || typeof value !== "object")
    throw new Error(`Invalid environment evidence: ${sourcePath}`);
  for (const key of requiredStrings)
    if (typeof value[key] !== "string" || value[key].length === 0)
      throw new Error(`Missing browser environment field ${key}: ${sourcePath}`);
  if (value.schema_version !== "1.1.0")
    throw new Error(`Unsupported environment schema: ${sourcePath}`);
  if (!requiredTargets.includes(value.requested_target))
    throw new Error(`Invalid requested target in browser environment: ${sourcePath}`);
  if (
    !hex.test(value.executable_sha256) ||
    !hex.test(value.extension_artifact_sha256) ||
    !hex.test(value.extension_zip_sha256) ||
    !hex.test(value.manifest_sha256)
  )
    throw new Error(`Invalid browser provenance digest: ${sourcePath}`);
  if (
    !Number.isInteger(value.extension_artifact_file_count) ||
    value.extension_artifact_file_count < 1
  )
    throw new Error(`Invalid extension artifact file count: ${sourcePath}`);
  if (value.source_under_test !== "exact_packaged_zip_extracted")
    throw new Error(`Browser evidence did not load the exact packaged artifact: ${sourcePath}`);
  if (!Number.isInteger(value.indexeddb_version) || value.indexeddb_version < 1)
    throw new Error(`Invalid IndexedDB version evidence: ${sourcePath}`);
  if (!value.service_worker_url.startsWith(`chrome-extension://${value.extension_id}/`))
    throw new Error(`Service-worker URL does not match extension ID: ${sourcePath}`);
  const expectedScope =
    value.browser_family === "chrome"
      ? "EXACT_GOOGLE_CHROME"
      : value.browser_family === "edge"
        ? "EXACT_MICROSOFT_EDGE"
        : value.browser_family === "chromium"
          ? "AUTOMATED_PLAYWRIGHT_CHROMIUM"
          : null;
  if (!expectedScope || value.qualification_scope !== expectedScope)
    throw new Error(`Browser family and qualification scope conflict: ${sourcePath}`);
  const expectedExact =
    (value.requested_target === "chrome" && value.browser_family === "chrome") ||
    (value.requested_target === "edge" && value.browser_family === "edge");
  if (value.exact_requested_product !== expectedExact)
    throw new Error(`Exact-product claim conflicts with browser evidence: ${sourcePath}`);
}

function stableRuntimeIdentity(value) {
  return JSON.stringify([
    value.requested_target,
    value.browser_family,
    value.qualification_scope,
    value.executable_sha256,
    value.browser_version_command,
    value.browser_runtime_version,
    value.extension_target,
    value.extension_artifact_sha256,
    value.extension_zip_sha256,
    value.source_under_test,
    value.manifest_sha256,
    value.manifest_version,
    value.extension_id,
    value.service_worker_url,
    value.platform,
    value.architecture,
  ]);
}

function collectSuite(suite, target, increment) {
  for (const spec of suite.specs ?? []) {
    if (spec.ok !== true)
      throw new Error(`Browser spec failed: ${spec.file}:${spec.line} ${spec.title}`);
    for (const test of spec.tests ?? []) {
      if (test.status !== "expected" || test.expectedStatus !== "passed")
        throw new Error(`Unexpected browser test status: ${spec.title}`);
      if (
        !Array.isArray(test.results) ||
        test.results.length !== 1 ||
        test.results[0]?.status !== "passed"
      )
        throw new Error(`Browser test did not have exactly one passing result: ${spec.title}`);
      target.push({
        file: path.basename(spec.file),
        line: spec.line,
        title: spec.title,
        duration_ms: Math.round(test.results[0].duration ?? 0),
      });
      increment();
    }
  }
  for (const child of suite.suites ?? []) collectSuite(child, target, increment);
}

async function findNearestEnvironment(reportPath, boundary) {
  let directory = path.dirname(reportPath);
  const rootPath = path.resolve(boundary);
  while (directory.startsWith(rootPath)) {
    const candidate = path.join(directory, "environment.json");
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue toward the artifact root.
    }
    if (directory === rootPath) break;
    directory = path.dirname(directory);
  }
  return null;
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

async function collectRuntimeScenarios(directory) {
  const scenarioPaths = await findNamedFiles(directory, "qualification-runtime-scenario.json");
  const scenarios = [];
  for (const scenarioPath of scenarioPaths) {
    const bytes = await readFile(scenarioPath);
    const value = JSON.parse(bytes.toString("utf8"));
    scenarios.push({
      path: relative(scenarioPath),
      sha256: sha256(bytes),
      requested_target: value.requested_target ?? null,
      session_id: value.session_id ?? null,
      capture_job_id: value.capture_job_id ?? null,
      exported_package_sha256: value.exported_package_sha256 ?? null,
      service_worker_startup_sequence: value.service_worker_startup_sequence ?? null,
      indexeddb_version: value.indexeddb_version ?? null,
      schema_version: value.schema_version ?? null,
    });
  }
  return scenarios.sort((a, b) => a.path.localeCompare(b.path));
}

async function writeQualification(output) {
  output.full_release_gate_passed =
    output.exact_chrome_qualified === true && output.exact_edge_qualified === true;
  await mkdir(outputRoot, { recursive: true });
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(path.join(outputRoot, "browser-qualification.json"), serialized, "utf8");
  await writeFile(
    path.join(outputRoot, "browser-qualification.sha256"),
    `${sha256(Buffer.from(serialized))}  browser-qualification.json\n`,
    "utf8",
  );
}

function testIdentity(item) {
  return `${item.file}::${item.title}`;
}
function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}
function relativeToProcess(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
