import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("artifacts/personal-package-reproducibility");
const first = path.join(root, "first");
const second = path.join(root, "second");
const final = path.resolve("artifacts/personal-release");
await rm(root, { recursive: true, force: true });
await rm(final, { recursive: true, force: true });
await mkdir(first, { recursive: true });
await mkdir(second, { recursive: true });
run(first);
run(second);
const a = await inventory(first);
const b = await inventory(second);
const mismatches = [];
for (const key of new Set([...a.keys(), ...b.keys()])) {
  const left = a.get(key);
  const right = b.get(key);
  if (!left || !right || left.bytes !== right.bytes || left.sha256 !== right.sha256)
    mismatches.push({ path: key, first: left ?? null, second: right ?? null });
}
const report = {
  schema_version: "1.0.0",
  result: mismatches.length === 0 ? "PASS" : "FAIL",
  first_file_count: a.size,
  second_file_count: b.size,
  mismatches,
};
await writeFile(
  path.join(root, "personal-package-reproducibility.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (mismatches.length)
  throw new Error(`Personal package reproducibility failed for ${mismatches.length} files.`);
await cp(first, final, { recursive: true });
console.log(`Personal package reproducibility: PASS for ${a.size} files.`);

function run(directory) {
  const result = spawnSync(process.execPath, ["scripts/package-personal-release.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, EDIS_PERSONAL_PACKAGE_DIR: directory },
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(`Personal packaging failed with ${String(result.status)}.`);
}
async function inventory(directory) {
  const output = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const data = await readFile(path.join(directory, entry.name));
    output.set(entry.name, {
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  return output;
}
