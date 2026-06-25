export interface ParsedZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly compressionMethod: number;
  readonly dosTime: number;
  readonly dosDate: number;
}

export function parseStoreZip(bytes: Uint8Array): readonly ParsedZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ParsedZipEntry[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`Invalid local ZIP header at ${offset}.`);
    if (offset + 30 > bytes.length) throw new Error("Truncated local ZIP header.");
    const compressionMethod = view.getUint16(offset + 8, true);
    const dosTime = view.getUint16(offset + 10, true);
    const dosDate = view.getUint16(offset + 12, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (compressionMethod !== 0 || compressedSize !== uncompressedSize)
      throw new Error("Expected deterministic store-only ZIP entry.");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("Truncated ZIP entry.");
    const entryPath = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.push({
      path: entryPath,
      bytes: bytes.slice(dataStart, dataEnd),
      compressionMethod,
      dosTime,
      dosDate,
    });
    offset = dataEnd;
  }
  return entries;
}
