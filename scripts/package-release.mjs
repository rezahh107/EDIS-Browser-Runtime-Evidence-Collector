import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const targets = process.argv.includes("--target")
  ? [process.argv[process.argv.indexOf("--target") + 1]]
  : ["chrome", "edge"];
if (targets.some((target) => target !== "chrome" && target !== "edge"))
  throw new Error("Package target must be chrome or edge.");
const metadata = JSON.parse(await readFile("package.json", "utf8"));
const output = path.resolve(process.env.EDIS_PACKAGE_DIR ?? "artifacts/packages");
await mkdir(output, { recursive: true });
for (const target of targets) {
  const root = path.resolve("dist", target);
  const files = await walk(root);
  if (
    !files.some((file) => path.relative(root, file).replaceAll(path.sep, "/") === "manifest.json")
  )
    throw new Error(`${target} package is missing root manifest.json.`);
  const entries = [];
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    assertPackagePath(relative);
    entries.push({ path: relative, data: new Uint8Array(await readFile(file)) });
  }
  const bytes = createStoreZip(entries);
  const filename = `edis-runtime-collector-${target}-${metadata.version}.zip`;
  await writeFile(path.join(output, filename), bytes);
  console.log(`${filename} ${bytes.length} bytes ${entries.length} files`);
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
    localView.setUint16(28, 0, true);
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
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
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
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, sorted.length, true);
  endView.setUint16(10, sorted.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);
  return concat([...localParts, ...centralParts, end]);
}

function assertPackagePath(value) {
  if (value.includes("__pycache__/") || value.endsWith(".pyc"))
    throw new Error(`Package cache artifact is forbidden: ${value}`);
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
