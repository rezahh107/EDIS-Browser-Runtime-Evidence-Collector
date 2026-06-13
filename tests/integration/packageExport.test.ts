import { describe, expect, it } from "vitest";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { makeSession, makeSnapshot } from "../helpers/fixtures";

describe("capture to package export", () => {
  it("creates a local ZIP with required entries", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    expect([...result.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.filename).toMatch(/^edis-runtime-package-/);
    expect(result.entryCount).toBeGreaterThanOrEqual(7);
  });
});
