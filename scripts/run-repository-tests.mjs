import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("artifacts/release-gate");
const reportPath = path.join(root, "repository-tests-results.json");
const runnerPath = path.join(root, "repository-tests-runner.json");
const logPath = path.join(root, "repository-tests-vitest.log");
const maximumRuntimeMs = 240_000;
const completedReportGraceMs = 2_000;

await mkdir(root, { recursive: true });
await Promise.all([reportPath, runnerPath, logPath].map((item) => rm(item, { force: true })));

const chunks = [];
const child = spawn(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--pool=threads",
    "--maxWorkers=1",
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ],
  {
    cwd: process.cwd(),
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", (chunk) => chunks.push(chunk));
child.stderr.on("data", (chunk) => chunks.push(chunk));

let exitResult = null;
child.once("exit", (code, signal) => {
  exitResult = { code, signal };
});

const startedAt = Date.now();
const heartbeat = setInterval(() => {
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  console.log(`Repository tests are still running (${elapsedSeconds}s elapsed).`);
}, 10_000);
heartbeat.unref();
let completeReport = null;
let reportCompletedAt = null;
let forcedCleanup = false;
let failureReason = null;

while (Date.now() - startedAt <= maximumRuntimeMs) {
  completeReport = await readCompleteReport(reportPath);
  if (completeReport && reportCompletedAt === null) reportCompletedAt = Date.now();

  if (exitResult) {
    if (!completeReport) failureReason = "Vitest exited without a complete JSON report.";
    else if (!reportPassed(completeReport)) failureReason = "Repository tests reported a failure.";
    else if (exitResult.code !== 0)
      failureReason = `Vitest exited with code ${String(exitResult.code)} after a passing report.`;
    break;
  }

  if (completeReport && !reportPassed(completeReport)) {
    failureReason = "Repository tests reported a failure.";
    await stopProcessTree(child);
    break;
  }

  if (
    completeReport &&
    reportCompletedAt !== null &&
    Date.now() - reportCompletedAt >= completedReportGraceMs
  ) {
    forcedCleanup = true;
    await stopProcessTree(child);
    break;
  }

  await delay(100);
}

if (!exitResult && !completeReport) {
  failureReason = `Repository tests did not produce a complete report within ${maximumRuntimeMs} ms.`;
  await stopProcessTree(child);
}

clearInterval(heartbeat);
await writeFile(logPath, Buffer.concat(chunks));
const finishedAt = Date.now();
const runnerEvidence = {
  schema_version: "1.0.0",
  started_at_epoch_ms: startedAt,
  finished_at_epoch_ms: finishedAt,
  duration_ms: finishedAt - startedAt,
  report_complete: Boolean(completeReport),
  report_passed: Boolean(completeReport && reportPassed(completeReport)),
  forced_cleanup_after_complete_report: forcedCleanup,
  child_exit: exitResult,
  failure_reason: failureReason,
};
await writeFile(runnerPath, `${JSON.stringify(runnerEvidence, null, 2)}\n`, "utf8");

if (failureReason || !completeReport || !reportPassed(completeReport)) {
  console.error(failureReason ?? "Repository tests failed.");
  process.exitCode = 1;
} else {
  console.log(
    `Repository tests: ${completeReport.numPassedTests}/${completeReport.numTotalTests} passed in ${completeReport.testResults.length} file(s).`,
  );
  if (forcedCleanup)
    console.log(
      "Vitest retained an internal handle after writing the complete report; the isolated process group was cleaned up.",
    );
}

async function readCompleteReport(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(parsed.testResults) || !Number.isInteger(parsed.numTotalTests)) return null;
    const assertions = parsed.testResults.flatMap((item) => item.assertionResults ?? []);
    if (assertions.length !== parsed.numTotalTests) return null;
    const accounted =
      parsed.numPassedTests + parsed.numFailedTests + parsed.numPendingTests + parsed.numTodoTests;
    if (accounted !== parsed.numTotalTests) return null;
    return parsed;
  } catch {
    return null;
  }
}

function reportPassed(value) {
  return (
    value.success === true &&
    value.numFailedTests === 0 &&
    value.numPendingTests === 0 &&
    value.numTodoTests === 0 &&
    value.numPassedTests === value.numTotalTests &&
    value.testResults.length > 0 &&
    value.testResults.every((item) => item.status === "passed")
  );
}

async function stopProcessTree(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  try {
    processHandle.kill("SIGTERM");
  } catch {
    // The child may have exited between the state check and the signal.
  }
  const deadline = Date.now() + 2_000;
  while (
    Date.now() < deadline &&
    processHandle.exitCode === null &&
    processHandle.signalCode === null
  )
    await delay(50);
  if (processHandle.exitCode === null && processHandle.signalCode === null) {
    try {
      processHandle.kill("SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
