import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("artifacts/release-gate");
const reportPath = path.join(root, "repository-tests-results.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
if (!reportPassed(report))
  throw new Error("Repository tests did not produce a complete passing JSON report.");

const suites = ["unit", "security", "integration"];
let accountedTests = 0;
let accountedFiles = 0;
for (const suite of suites) {
  const partition = partitionReport(report, suite);
  accountedTests += partition.numTotalTests;
  accountedFiles += partition.testResults.length;
  await writeFile(
    path.join(root, `${suite}-tests-results.json`),
    `${JSON.stringify(partition, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `${suite}: ${partition.numPassedTests} passed in ${partition.testResults.length} file(s), 0 failed, 0 skipped.`,
  );
}
if (accountedTests !== report.numTotalTests || accountedFiles !== report.testResults.length)
  throw new Error("Repository test partitioning did not account for every test and file.");
const passedFiles = report.testResults.filter((item) => item.status === "passed").length;
console.log(`Test Files  ${passedFiles} passed (${report.testResults.length})`);
console.log(`Tests       ${report.numPassedTests} passed (${report.numTotalTests})`);

function reportPassed(value) {
  const accounted =
    value.numPassedTests + value.numFailedTests + value.numPendingTests + value.numTodoTests;
  return (
    value.success === true &&
    Array.isArray(value.testResults) &&
    Number.isInteger(value.numTotalTests) &&
    accounted === value.numTotalTests &&
    value.numFailedTests === 0 &&
    value.numPendingTests === 0 &&
    value.numTodoTests === 0 &&
    value.numPassedTests === value.numTotalTests &&
    value.testResults.every((item) => item.status === "passed")
  );
}

function partitionReport(value, suite) {
  const marker = `${path.sep}tests${path.sep}${suite}${path.sep}`;
  const testResults = value.testResults.filter((item) => item.name.includes(marker));
  const assertions = testResults.flatMap((item) => item.assertionResults ?? []);
  const passed = assertions.filter((item) => item.status === "passed").length;
  const failed = assertions.filter((item) => item.status === "failed").length;
  const pending = assertions.filter((item) => ["pending", "skipped"].includes(item.status)).length;
  const todo = assertions.filter((item) => item.status === "todo").length;
  return {
    ...value,
    numTotalTestSuites: testResults.length,
    numPassedTestSuites: testResults.filter((item) => item.status === "passed").length,
    numFailedTestSuites: testResults.filter((item) => item.status === "failed").length,
    numPendingTestSuites: testResults.filter((item) => item.status === "pending").length,
    numTotalTests: assertions.length,
    numPassedTests: passed,
    numFailedTests: failed,
    numPendingTests: pending,
    numTodoTests: todo,
    success:
      testResults.length > 0 &&
      failed === 0 &&
      pending === 0 &&
      todo === 0 &&
      passed === assertions.length,
    testResults,
  };
}
