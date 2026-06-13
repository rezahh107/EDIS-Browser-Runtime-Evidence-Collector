import { describe, expect, it } from "vitest";
import { assertSafeZipPath } from "../../src/infrastructure/zip";
import { safeFilename } from "../../src/infrastructure/download";

describe("unsafe filenames and ZIP traversal", () => {
  it("blocks parent segments", () => {
    expect(() => assertSafeZipPath("sessions/../../secret.txt")).toThrow();
  });

  it("normalizes download filenames", () => {
    expect(safeFilename("../../private\\capture?.zip")).toBe("private-capture-.zip");
  });
});
