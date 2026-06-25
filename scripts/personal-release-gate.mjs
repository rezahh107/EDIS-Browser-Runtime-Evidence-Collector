import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDir = path.resolve("artifacts/personal-release-gate");
await mkdir(outputDir, { recursive: true });
const commands = [
  ["typecheck", "npm", ["run", "typecheck"]],
  ["lint", "npm", ["run", "lint"]],
  ["format", "npm", ["run", "format:check"]],
  ["repository-test-prepare", process.execPath, ["scripts/prepare-repository-tests.mjs"]],
  ["repository-tests", process.execPath, ["scripts/run-repository-tests.mjs"]],
  ["repository-test-audit", process.execPath, ["scripts/run-test-gate.mjs"]],
  ["schema-validation", "npm", ["run", "validate:schemas"]],
  ["production-build", "npm", ["run", "build"]],
  ["package-validation", "npm", ["run", "validate"]],
  ["reproducibility", "npm", ["run", "build:reproducible"]],
  ["dependency-audit", "npm", ["run", "audit"]],
  ["performance-observation", process.execPath, ["scripts/personal-performance-report.mjs"]],
];
const results = [];
for (const [id, command, args] of commands) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: id === "repository-tests" ? 300_000 : 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  const record = {
    id,
    command: `${command} ${args.join(" ")}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    exitCode: result.status ?? (result.error ? 1 : 0),
    signal: result.signal ?? null,
    outputSha256: createHash("sha256").update(output).digest("hex"),
    error: result.error?.message ?? null,
  };
  results.push(record);
  await writeFile(path.join(outputDir, `${id}.log`), output, "utf8");
  if (record.exitCode !== 0 || record.error) break;
}
const passed = results.length === commands.length && results.every((item) => item.exitCode === 0);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectVersion: JSON.parse(
    await (await import("node:fs/promises")).readFile("package.json", "utf8"),
  ).version,
  profile: "PERSONAL_UNPACKED_STABILITY",
  browserStorePublicationRequired: false,
  status: passed ? "PASS" : "FAIL",
  commands: results,
};
await writeFile(
  path.join(outputDir, "personal-release-gate.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(`Personal release gate: ${report.status}.`);
process.exit(passed ? 0 : 1);
