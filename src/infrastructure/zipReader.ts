import { assertSafeZipPath, crc32 } from "./zip";
import { MAX_ZIP_ENTRY_COUNT, MAX_ZIP_PAYLOAD_BYTES } from "../domain/resourceLimits";

export interface ParsedStoreZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export function parseStoreZip(bytes: Uint8Array): readonly ParsedStoreZipEntry[] {
  if (bytes.length === 0 || bytes.length > MAX_ZIP_PAYLOAD_BYTES)
    throw new Error("ZIP payload is outside the supported size range.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ParsedStoreZipEntry[] = [];
  const paths = new Set<string>();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`Invalid local ZIP header at ${offset}.`);
    if (offset + 30 > bytes.length) throw new Error("Truncated local ZIP header.");
    const flags = view.getUint16(offset + 6, true);
    const compressionMethod = view.getUint16(offset + 8, true);
    const expectedCrc = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if ((flags & 0x0008) !== 0) throw new Error("ZIP data descriptors are not supported.");
    if (compressionMethod !== 0 || compressedSize !== uncompressedSize)
      throw new Error("Expected deterministic store-only ZIP entry.");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("Truncated ZIP entry.");
    const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    assertSafeZipPath(path);
    if (paths.has(path)) throw new Error(`Duplicate ZIP entry path: ${path}`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC validation failed: ${path}`);
    paths.add(path);
    entries.push({ path, bytes: data });
    if (entries.length > MAX_ZIP_ENTRY_COUNT)
      throw new Error("ZIP entry count exceeds the safety limit.");
    offset = dataEnd;
  }
  if (entries.length === 0) throw new Error("ZIP contains no local entries.");
  return entries;
}
