import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const index = process.argv.indexOf("--root");
const workflowRoot = path.resolve(index >= 0 ? process.argv[index + 1] : ".github/workflows");
const outputIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  outputIndex >= 0 ? process.argv[outputIndex + 1] : "artifacts/release-gate/workflow-actions.json",
);
const files = (await readdir(workflowRoot, { withFileTypes: true }))
  .filter((item) => item.isFile() && /\.ya?ml$/i.test(item.name))
  .map((item) => path.join(workflowRoot, item.name))
  .sort();
if (files.length === 0) throw new Error(`No workflow files found under ${workflowRoot}.`);

const references = [];
const violations = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const [zeroBasedLine, line] of content.split("\n").entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(.*))?\s*$/);
    if (!match) continue;
    const value = match[1];
    const record = {
      file: path.relative(process.cwd(), file).replaceAll(path.sep, "/"),
      line: zeroBasedLine + 1,
      value,
      annotation: match[2]?.trim() ?? null,
    };
    references.push(record);
    if (value.startsWith("./")) continue;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(value))
      violations.push({ ...record, reason: "External action is not pinned to a full commit SHA." });
  }
}
if (references.length === 0) violations.push({ reason: "No action references were discovered." });
const report = {
  schema_version: "1.0.0",
  result: violations.length === 0 ? "PASS" : "FAIL",
  workflow_files: files.map((file) => path.relative(process.cwd(), file).replaceAll(path.sep, "/")),
  external_or_local_references: references,
  violations,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (violations.length > 0) {
  for (const violation of violations)
    console.error(
      `${violation.file ?? "workflow"}:${violation.line ?? 0} ${violation.reason} ${violation.value ?? ""}`,
    );
  process.exitCode = 1;
} else {
  console.log(`Workflow action pin validation: PASS (${references.length} reference(s)).`);
}
