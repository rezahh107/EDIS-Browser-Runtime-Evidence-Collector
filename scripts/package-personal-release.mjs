import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCanonicalSourceManifest, canonicalManifestText } from "./source-inventory.mjs";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const exactHead = gitHead();
const output = path.resolve(process.env.EDIS_PERSONAL_PACKAGE_DIR ?? "artifacts/personal-release");
await mkdir(output, { recursive: true });

const committedManifestText = await readFile("GENERATION_MANIFEST.json", "utf8");
if (committedManifestText !== canonicalManifestText(await buildCanonicalSourceManifest()))
  throw new Error("Committed source manifest is stale; personal packaging is blocked.");
const sourceManifest = JSON.parse(committedManifestText);
if (sourceManifest.extension_version !== version)
  throw new Error("Source manifest version mismatch.");

const releaseEvidence = JSON.parse(
  await readFile("artifacts/release-evidence/release-evidence.json", "utf8"),
);
if (releaseEvidence.projectVersion !== version)
  throw new Error("Release evidence projectVersion does not match package version.");
if (releaseEvidence.commitHash !== exactHead)
  throw new Error("Release evidence commitHash does not match exact Git Head.");
await readFile(`docs/release/${version}-release-notes.md`, "utf8");

const sourceEntries = [];
for (const item of sourceManifest.files) {
  assertSourcePackagePath(item.path);
  const data = new Uint8Array(await readFile(item.path));
  if (data.length !== item.bytes || sha256(data) !== item.sha256)
    throw new Error(`Source manifest mismatch: ${item.path}`);
  sourceEntries.push({ path: item.path, data });
}
assertSourcePackagePath("GENERATION_MANIFEST.json");
sourceEntries.push({
  path: "GENERATION_MANIFEST.json",
  data: new Uint8Array(await readFile("GENERATION_MANIFEST.json")),
});
const sourceZipName = `edis-runtime-collector-source-${version}.zip`;
const sourceZip = createStoreZip(sourceEntries);
await writeFile(path.join(output, sourceZipName), sourceZip);

const chromeSource = new Uint8Array(
  await readFile(`artifacts/packages/edis-runtime-collector-chrome-${version}.zip`),
);
const edgeSource = new Uint8Array(
  await readFile(`artifacts/packages/edis-runtime-collector-edge-${version}.zip`),
);
const chromeName = `EDIS-Chrome-Load-Unpacked-${version}.zip`;
const edgeName = `EDIS-Edge-Load-Unpacked-${version}.zip`;
await writeFile(path.join(output, chromeName), chromeSource);
await writeFile(path.join(output, edgeName), edgeSource);

const componentSums =
  [
    [chromeName, chromeSource],
    [edgeName, edgeSource],
    [sourceZipName, sourceZip],
  ]
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .join("\n") + "\n";

const completeEntries = [
  { path: chromeName, data: chromeSource },
  { path: edgeName, data: edgeSource },
  { path: sourceZipName, data: sourceZip },
  { path: "SHA256SUMS.txt", data: encode(componentSums) },
  { path: "reports/VALIDATION.txt", data: await bytes("VALIDATION.txt") },
  { path: "reports/README.md", data: await bytes("README.md") },
  { path: "reports/HELP.md", data: await bytes("HELP.md") },
  { path: "reports/HELP_FA.md", data: await bytes("HELP_FA.md") },
  {
    path: `reports/EDIS-${version}-RELEASE-NOTES.md`,
    data: await bytes(`docs/release/${version}-release-notes.md`),
  },
  {
    path: `reports/EDIS-${version}-RELEASE-EVIDENCE.json`,
    data: await bytes("artifacts/release-evidence/release-evidence.json"),
  },
  {
    path: `reports/EDIS-${version}-RELEASE-EVIDENCE.md`,
    data: await bytes("artifacts/release-evidence/release-evidence.md"),
  },
  {
    path: "reports/browser-qualification.json",
    data: await bytes("artifacts/browser-e2e/browser-qualification.json"),
  },
  {
    path: "reports/release-gate-command-results.json",
    data: await bytes("artifacts/release-gate/command-results.json"),
  },
  {
    path: "reports/full-release-qualification.json",
    data: await bytes("artifacts/release-gate/full-release-qualification.json"),
  },
  {
    path: "reports/reproducibility.json",
    data: await bytes("artifacts/reproducibility/reproducibility.json"),
  },
  {
    path: "reports/reproducibility.md",
    data: await bytes("artifacts/reproducibility/reproducibility.md"),
  },
  {
    path: "contracts/EDIS-Cross-Product-Contract-Freeze-v1.0.0.md",
    data: await bytes("docs/contracts/EDIS-Cross-Product-Contract-Freeze-v1.0.0.md"),
  },
];
const completeName = `edis-runtime-collector-complete-${version}.zip`;
const completeZip = createStoreZip(completeEntries);
await writeFile(path.join(output, completeName), completeZip);

const externalSums =
  [
    [chromeName, chromeSource],
    [edgeName, edgeSource],
    [sourceZipName, sourceZip],
    [completeName, completeZip],
  ]
    .map(([name, data]) => `${sha256(data)}  ${name}`)
    .join("\n") + "\n";
await writeFile(path.join(output, "RELEASE-SHA256SUMS.txt"), externalSums, "utf8");
console.log(`Personal release package created at ${output}.`);
for (const [name, data] of [
  [chromeName, chromeSource],
  [edgeName, edgeSource],
  [sourceZipName, sourceZip],
  [completeName, completeZip],
])
  console.log(`${name} ${data.length} bytes ${sha256(data)}`);

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}
async function bytes(file) {
  return new Uint8Array(await readFile(file));
}
function encode(value) {
  return new TextEncoder().encode(value);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function createStoreZip(entries) {
  const sorted = [...entries].sort((a, b) => compare(a.path, b.path));
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of sorted) {
    validatePath(entry.path);
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    localParts.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 0x0314, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(38, 0o100644 << 16, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, sorted.length, true);
  endView.setUint16(10, sorted.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return concat([...localParts, ...centralParts, end]);
}
function assertSourcePackagePath(value) {
  if (value.includes("__pycache__/") || value.endsWith(".pyc"))
    throw new Error(`Source package cache artifact is forbidden: ${value}`);
}
function validatePath(value) {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0"))
    throw new Error(`Unsafe ZIP path: ${value}`);
  if (value.split("/").some((part) => part === "" || part === "." || part === ".."))
    throw new Error(`Unsafe ZIP path: ${value}`);
}
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function concat(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
