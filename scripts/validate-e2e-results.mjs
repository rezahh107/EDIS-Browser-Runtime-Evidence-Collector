import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const defaultRoot = `artifacts/browser-e2e-${version}`;
const input = path.resolve(process.argv[2] ?? `${defaultRoot}/playwright-results.json`);
const output = path.resolve(process.argv[3] ?? `${defaultRoot}/qualification-summary.json`);
const expectedTests = Number(process.env.EDIS_E2E_EXPECTED_TESTS ?? "29");
const expectedFiles = Number(process.env.EDIS_E2E_EXPECTED_FILES ?? "6");
const report = JSON.parse(await readFile(input, "utf8"));
const records = [];

function visitSuite(suite, inheritedFile = "") {
  const suiteFile = suite.file || inheritedFile;
  for (const spec of suite.specs ?? []) {
    const file = spec.file || suiteFile;
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      records.push({
        id: spec.id,
        file,
        title: spec.title,
        expectedStatus: test.expectedStatus,
        status: result?.status ?? "missing",
        testStatus: test.status ?? "unknown",
        errors: result?.errors?.length ?? 0,
      });
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child, suiteFile);
}
for (const suite of report.suites ?? []) visitSuite(suite);

const identities = records.map((item) => `${item.file}::${item.id}::${item.title}`);
const uniqueIdentities = new Set(identities);
const files = new Set(records.map((item) => item.file).filter(Boolean));
const passed = records.filter(
  (item) =>
    item.expectedStatus === "passed" &&
    item.status === "passed" &&
    item.testStatus === "expected" &&
    item.errors === 0,
);
const failed = records.filter((item) => !passed.includes(item));
const topLevelErrors = Array.isArray(report.errors) ? report.errors.length : 0;
const valid =
  records.length === expectedTests &&
  uniqueIdentities.size === expectedTests &&
  files.size === expectedFiles &&
  passed.length === expectedTests &&
  failed.length === 0 &&
  topLevelErrors === 0;

const summary = {
  schema_version: "1.0.0",
  artifact_type: "browser_qualification_summary",
  source_report: path.relative(process.cwd(), input).replaceAll(path.sep, "/"),
  expected: { test_files: expectedFiles, tests: expectedTests },
  observed: {
    test_files: files.size,
    tests: records.length,
    unique_tests: uniqueIdentities.size,
    passed: passed.length,
    failed: failed.length,
    skipped: records.filter((item) => item.status === "skipped").length,
    top_level_errors: topLevelErrors,
  },
  result: valid ? "PASS" : "FAIL",
  failures: failed,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
if (!valid) process.exitCode = 1;
