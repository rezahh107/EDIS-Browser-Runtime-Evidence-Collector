import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("GENERATION_MANIFEST.json", "utf8"));
if (manifest.extension_version !== metadata.version)
  throw new Error("Source manifest version diverged from package version.");
const output = path.resolve(process.env.EDIS_PACKAGE_DIR ?? "artifacts/packages");
await mkdir(output, { recursive: true });
const entries = [];
for (const item of manifest.files) {
  validatePath(item.path);
  const data = new Uint8Array(await readFile(item.path));
  if (data.length !== item.bytes || sha256(data) !== item.sha256)
    throw new Error(`Source manifest mismatch: ${item.path}`);
  entries.push({ path: item.path, data });
}
entries.push({
  path: "GENERATION_MANIFEST.json",
  data: new Uint8Array(await readFile("GENERATION_MANIFEST.json")),
});
const bytes = createStoreZip(entries);
const filename = `edis-runtime-collector-source-${metadata.version}.zip`;
await writeFile(path.join(output, filename), bytes);
console.log(`${filename} ${bytes.length} bytes ${entries.length} files ${sha256(bytes)}`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function createStoreZip(input) {
  const sorted = [...input].sort((a, b) => compare(a.path, b.path));
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
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, sorted.length, true);
  endView.setUint16(10, sorted.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...localParts, ...centralParts, end]);
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
