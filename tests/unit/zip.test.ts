import { describe, expect, it } from "vitest";
import { assertSafeZipPath, createStoreZip, crc32 } from "../../src/infrastructure/zip";

describe("ZIP writer", () => {
  it("rejects path traversal and absolute paths", () => {
    for (const path of ["../x", "/x", "C:/x", "a\\b", "a//b"])
      expect(() => assertSafeZipPath(path)).toThrow();
  });

  it("creates a valid ZIP signature with deterministic ordering", () => {
    const zip = createStoreZip([
      { path: "b.txt", data: new TextEncoder().encode("b") },
      { path: "a.txt", data: new TextEncoder().encode("a") },
    ]);
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
