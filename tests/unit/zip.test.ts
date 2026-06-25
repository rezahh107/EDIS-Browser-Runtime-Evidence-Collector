import { describe, expect, it } from "vitest";
import { assertSafeZipPath, createStoreZip, crc32 } from "../../src/infrastructure/zip";
import { parseStoreZip } from "../../src/infrastructure/zipReader";

describe("ZIP writer", () => {
  it("rejects path traversal and absolute paths", () => {
    for (const path of ["../x", "/x", "C:/x", "a\\b", "a//b", "a/./b", "a\u0001b"])
      expect(() => assertSafeZipPath(path)).toThrow();
  });

  it("rejects an excessively long UTF-8 entry path", () => {
    expect(() => assertSafeZipPath(`${"é".repeat(2_049)}.txt`)).toThrow(/UTF-8 safety limit/);
  });

  it("rejects duplicate entry paths", () => {
    expect(() =>
      createStoreZip([
        { path: "a.txt", data: new Uint8Array() },
        { path: "a.txt", data: new Uint8Array() },
      ]),
    ).toThrow(/Duplicate/);
  });

  it("creates a valid ZIP signature with deterministic ordering", () => {
    const zip = createStoreZip([
      { path: "b.txt", data: new TextEncoder().encode("b") },
      { path: "a.txt", data: new TextEncoder().encode("a") },
    ]);
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("parses entry payloads as zero-copy views over the archive", () => {
    const zip = createStoreZip([{ path: "payload.bin", data: new Uint8Array([1, 2, 3, 4]) }]);
    const [entry] = parseStoreZip(zip);
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected a parsed ZIP entry.");
    expect(entry.bytes.buffer).toBe(zip.buffer);
    expect([...entry.bytes]).toEqual([1, 2, 3, 4]);
  });
});
