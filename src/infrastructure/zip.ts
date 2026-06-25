import { compareCanonicalStrings } from "../domain/canonical";
import {
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  MAX_ZIP_PAYLOAD_BYTES,
} from "../domain/resourceLimits";

export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

interface PreparedZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
  readonly name: Uint8Array;
  readonly crc: number;
  readonly localOffset: number;
}

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const CRC32_TABLE = createCrc32Table();

export function assertSafeZipPath(path: string): void {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path))
    throw new Error("ZIP entry path must be relative.");
  if (
    path.includes("\\") ||
    path.split("/").some((part) => part === "." || part === ".." || part === "")
  )
    throw new Error("ZIP entry path is unsafe.");
  if (/[\u0000-\u001f\u007f]/u.test(path))
    throw new Error("ZIP entry path contains a control character.");
  if (new TextEncoder().encode(path).length > 4_096)
    throw new Error("ZIP entry path exceeds the UTF-8 safety limit.");
}

export function createStoreZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length === 0 || entries.length > MAX_ZIP_ENTRY_COUNT)
    throw new Error("ZIP entry count is outside the supported range.");
  const sorted = [...entries].sort((a, b) => compareCanonicalStrings(a.path, b.path));
  const uniquePaths = new Set(sorted.map((entry) => entry.path));
  if (uniquePaths.size !== sorted.length) throw new Error("Duplicate ZIP entry path.");

  let payloadBytes = 0;
  let localBytes = 0;
  let centralBytes = 0;
  const prepared: PreparedZipEntry[] = [];
  const encoder = new TextEncoder();

  for (const entry of sorted) {
    assertSafeZipPath(entry.path);
    if (entry.data.length > MAX_ZIP_ENTRY_BYTES)
      throw new Error("ZIP entry exceeds the safety limit.");
    payloadBytes = safeAdd(payloadBytes, entry.data.length);
    if (payloadBytes > MAX_ZIP_PAYLOAD_BYTES)
      throw new Error("ZIP payload exceeds the local export safety limit.");
    const name = encoder.encode(entry.path);
    const localOffset = localBytes;
    localBytes = safeAdd(localBytes, LOCAL_HEADER_SIZE + name.length + entry.data.length);
    centralBytes = safeAdd(centralBytes, CENTRAL_HEADER_SIZE + name.length);
    prepared.push({
      path: entry.path,
      data: entry.data,
      name,
      crc: crc32(entry.data),
      localOffset,
    });
  }

  const totalBytes = safeAdd(safeAdd(localBytes, centralBytes), END_RECORD_SIZE);
  if (localBytes > 0xffffffff || centralBytes > 0xffffffff || totalBytes > 0xffffffff)
    throw new Error("ZIP32 size limit exceeded.");

  const output = new Uint8Array(totalBytes);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const entry of prepared) {
    offset = writeLocalHeader(output, view, offset, entry);
    output.set(entry.name, offset);
    offset += entry.name.length;
    output.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralOffset = offset;
  for (const entry of prepared) {
    offset = writeCentralHeader(output, view, offset, entry);
    output.set(entry.name, offset);
    offset += entry.name.length;
  }

  writeU32(view, offset, 0x06054b50);
  writeU16(view, offset + 4, 0);
  writeU16(view, offset + 6, 0);
  writeU16(view, offset + 8, prepared.length);
  writeU16(view, offset + 10, prepared.length);
  writeU32(view, offset + 12, centralBytes);
  writeU32(view, offset + 16, centralOffset);
  writeU16(view, offset + 20, 0);
  offset += END_RECORD_SIZE;

  if (offset !== output.length) throw new Error("ZIP byte accounting mismatch.");
  return output;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff];
    if (tableValue === undefined) throw new Error("CRC32 table lookup failed.");
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeLocalHeader(
  output: Uint8Array,
  view: DataView,
  offset: number,
  entry: PreparedZipEntry,
): number {
  writeU32(view, offset, 0x04034b50);
  writeU16(view, offset + 4, 20);
  writeU16(view, offset + 6, 0x0800);
  writeU16(view, offset + 8, 0);
  writeU16(view, offset + 10, 0);
  writeU16(view, offset + 12, 0x0021);
  writeU32(view, offset + 14, entry.crc);
  writeU32(view, offset + 18, entry.data.length);
  writeU32(view, offset + 22, entry.data.length);
  writeU16(view, offset + 26, entry.name.length);
  writeU16(view, offset + 28, 0);
  return offset + LOCAL_HEADER_SIZE;
}

function writeCentralHeader(
  output: Uint8Array,
  view: DataView,
  offset: number,
  entry: PreparedZipEntry,
): number {
  void output;
  writeU32(view, offset, 0x02014b50);
  writeU16(view, offset + 4, 20);
  writeU16(view, offset + 6, 20);
  writeU16(view, offset + 8, 0x0800);
  writeU16(view, offset + 10, 0);
  writeU16(view, offset + 12, 0);
  writeU16(view, offset + 14, 0x0021);
  writeU32(view, offset + 16, entry.crc);
  writeU32(view, offset + 20, entry.data.length);
  writeU32(view, offset + 24, entry.data.length);
  writeU16(view, offset + 28, entry.name.length);
  writeU16(view, offset + 30, 0);
  writeU16(view, offset + 32, 0);
  writeU16(view, offset + 34, 0);
  writeU16(view, offset + 36, 0);
  writeU32(view, offset + 38, 0);
  writeU32(view, offset + 42, entry.localOffset);
  return offset + CENTRAL_HEADER_SIZE;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function safeAdd(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("ZIP size accounting overflow.");
  return total;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    table[index] = value >>> 0;
  }
  return table;
}
