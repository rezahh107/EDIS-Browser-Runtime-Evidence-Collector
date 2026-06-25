import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("artifacts/personal-performance");
await mkdir(outputDir, { recursive: true });
const report = JSON.parse(
  await readFile("artifacts/release-gate/repository-tests-results.json", "utf8"),
);
const assertions = report.testResults.flatMap((file) =>
  (file.assertionResults ?? []).map((assertion) => ({
    file: path.relative(process.cwd(), file.name).replaceAll(path.sep, "/"),
    name: assertion.fullName,
    status: assertion.status,
    durationMs: assertion.duration ?? null,
  })),
);
const selectedPhrases = [
  "tracks chunk count and byte totals",
  "finalizes a complete persisted capture exactly once",
  "large DOM",
  "hidden subtree",
];
const selected = assertions.filter((item) =>
  selectedPhrases.some((phrase) => item.name.toLowerCase().includes(phrase.toLowerCase())),
);
const builds = {};
for (const target of ["chrome", "edge"]) builds[target] = await inventory(`dist/${target}`);
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectVersion: JSON.parse(await readFile("package.json", "utf8")).version,
  status: report.success === true ? "PASS" : "FAIL",
  repositoryTests: {
    files: report.testResults.length,
    tests: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests + report.numTodoTests,
    measuredAssertionDurationMs: assertions.reduce(
      (sum, item) => sum + (typeof item.durationMs === "number" ? item.durationMs : 0),
      0,
    ),
  },
  selectedStabilityObservations: selected,
  productionBuilds: builds,
  note: "Durations are environment observations, not cross-machine pass thresholds. Correctness gates remain deterministic.",
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
await writeFile(path.join(outputDir, "personal-performance.json"), serialized);
await writeFile(
  path.join(outputDir, "personal-performance.sha256"),
  `${createHash("sha256").update(serialized).digest("hex")}  personal-performance.json\n`,
);
console.log(
  `Personal performance observation: ${result.repositoryTests.tests} tests, Chrome ${builds.chrome.files} files/${builds.chrome.bytes} bytes, Edge ${builds.edge.files} files/${builds.edge.bytes} bytes.`,
);

async function inventory(root) {
  const files = await walk(root);
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  return { files: files.length, bytes };
}

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(target)));
    else if (entry.isFile()) output.push(target);
  }
  return output.sort();
}
