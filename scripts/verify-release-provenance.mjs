import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
const packageRoot = path.resolve(process.env.EDIS_PACKAGE_DIR ?? "artifacts/packages");
const evidenceRoot = path.resolve("artifacts/release-provenance");
const extractedRoot = path.join(evidenceRoot, "source");
const rebuiltRoot = path.join(evidenceRoot, "rebuilt-packages");
await rm(evidenceRoot, { recursive: true, force: true });
await mkdir(extractedRoot, { recursive: true });
await mkdir(rebuiltRoot, { recursive: true });

const sourcePath = path.join(packageRoot, `edis-runtime-collector-source-${metadata.version}.zip`);
const sourceBytes = new Uint8Array(await readFile(sourcePath));
const entries = parseStoreZip(sourceBytes);
for (const [name, data] of entries) {
  validatePath(name);
  const destination = path.resolve(extractedRoot, name);
  if (!destination.startsWith(`${extractedRoot}${path.sep}`))
    throw new Error(`ZIP escape: ${name}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
}

await run(process.execPath, ["build.mjs", "--target", "all"], extractedRoot);
await run(process.execPath, ["scripts/package-release.mjs"], extractedRoot, {
  EDIS_PACKAGE_DIR: rebuiltRoot,
});

const comparisons = [];
for (const target of ["chrome", "edge"]) {
  const filename = `edis-runtime-collector-${target}-${metadata.version}.zip`;
  const shipped = new Uint8Array(await readFile(path.join(packageRoot, filename)));
  const rebuilt = new Uint8Array(await readFile(path.join(rebuiltRoot, filename)));
  const shippedHash = sha256(shipped);
  const rebuiltHash = sha256(rebuilt);
  comparisons.push({
    target,
    filename,
    shipped_bytes: shipped.length,
    rebuilt_bytes: rebuilt.length,
    shipped_sha256: shippedHash,
    rebuilt_sha256: rebuiltHash,
    byte_identical: shipped.length === rebuilt.length && shippedHash === rebuiltHash,
  });
}
const result = comparisons.every((item) => item.byte_identical) ? "PASS" : "FAIL";
const report = {
  schema_version: "1.0.0",
  result,
  project_version: metadata.version,
  source_zip: {
    path: path.relative(process.cwd(), sourcePath).replaceAll(path.sep, "/"),
    bytes: sourceBytes.length,
    sha256: sha256(sourceBytes),
    entry_count: entries.size,
  },
  comparisons,
};
await writeFile(
  path.join(evidenceRoot, "release-provenance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(path.join(evidenceRoot, "release-provenance.md"), renderMarkdown(report), "utf8");
if (result !== "PASS") throw new Error("Source-to-shipped release provenance verification failed.");
console.log(`Release artifact provenance: PASS (${comparisons.length} target(s)).`);

function run(command, args, cwd, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${String(code)} (${signal ?? "no signal"}).`));
    });
  });
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
      throw new Error("Source ZIP must use stored entries without data descriptors.");
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    if (compressedSize !== uncompressedSize) throw new Error("Stored ZIP size mismatch.");
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (dataEnd > bytes.length) throw new Error("Truncated source ZIP entry.");
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    validatePath(name);
    if (output.has(name)) throw new Error(`Duplicate source ZIP path: ${name}`);
    output.set(name, bytes.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  if (output.size === 0) throw new Error("Source ZIP contains no entries.");
  return output;
}
function validatePath(value) {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0"))
    throw new Error(`Unsafe ZIP path: ${value}`);
  if (value.split("/").some((part) => part === "" || part === "." || part === ".."))
    throw new Error(`Unsafe ZIP path: ${value}`);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function renderMarkdown(report) {
  const rows = report.comparisons
    .map(
      (item) =>
        `| ${item.target} | ${item.shipped_sha256} | ${item.rebuilt_sha256} | ${item.byte_identical ? "yes" : "no"} |`,
    )
    .join("\n");
  return `# Release Artifact Provenance\n\n- Version: ${report.project_version}\n- Result: **${report.result}**\n- Source ZIP SHA-256: \`${report.source_zip.sha256}\`\n\n| Target | Shipped SHA-256 | Rebuilt SHA-256 | Byte-identical |\n|---|---|---|---|\n${rows}\n`;
}
