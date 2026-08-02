import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportSession } from "../../src/application/exportUseCase";
import { downloadBytes } from "../../src/infrastructure/download";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import { makeSession, makeSnapshot, sessionId } from "../helpers/fixtures";

vi.mock("../../src/infrastructure/download", () => ({ downloadBytes: vi.fn() }));

describe("capture to package export", () => {
  beforeEach(async () => {
    vi.stubGlobal("Worker", undefined);
    vi.mocked(downloadBytes).mockClear();
    await new EvidenceRepository().clearAll();
  });

  it("creates a local ZIP with required entries", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    expect([...result.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.filename).toMatch(/^edis-runtime-package-/);
    expect(result.entryCount).toBeGreaterThanOrEqual(7);
    const repeated = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    expect(repeated.bytes).toEqual(result.bytes);
  });

  it.each(["RUNTIME_EVIDENCE", "MINIMUM_PYTHON_FEED"] as const)(
    "rejects readiness ERROR at the package authority for %s exports",
    async (purpose) => {
      const session = makeSession();
      const snapshot = makeSnapshot();
      let result: Awaited<ReturnType<typeof buildEvidencePackage>> | undefined;

      await expect(
        buildEvidencePackage({
          session: { ...session, data: { ...session.data, workflow_mode: purpose } },
          snapshots: [
            {
              ...snapshot,
              capture_readiness: { ...snapshot.capture_readiness, process_state: "ERROR" },
            },
          ],
          screenshots: [],
          purpose,
        }).then((built) => {
          result = built;
          return built;
        }),
      ).rejects.toThrow("EDIS_RUNTIME_READINESS_ERROR");
      expect(result).toBeUndefined();
      expect(result?.bytes).toBeUndefined();
      expect(result?.validation).toBeUndefined();
    },
  );

  it("rejects malformed readiness through controlled runtime validation", async () => {
    const malformed = { ...makeSnapshot(), capture_readiness: undefined };
    await expect(
      buildEvidencePackage({
        session: makeSession(),
        snapshots: [malformed as never],
        screenshots: [],
      }),
    ).rejects.toThrow("Stored snapshot failed runtime validation.");
  });

  it("routes exportSession through the real worker fallback and package authority", async () => {
    const repository = new EvidenceRepository();
    const snapshot = makeSnapshot();
    await repository.putSession(makeSession());
    await repository.putSnapshot({
      ...snapshot,
      capture_readiness: { ...snapshot.capture_readiness, process_state: "ERROR" },
    });

    await expect(exportSession(sessionId)).rejects.toThrow("EDIS_RUNTIME_READINESS_ERROR");
    expect(downloadBytes).not.toHaveBeenCalled();
  });

  it.each(["TIMEOUT", "UNSTABLE"] as const)(
    "preserves package export for %s readiness",
    async (processState) => {
      const snapshot = makeSnapshot();
      await expect(
        buildEvidencePackage({
          session: makeSession(),
          snapshots: [
            {
              ...snapshot,
              capture_readiness: {
                ...snapshot.capture_readiness,
                process_state: processState,
              },
            },
          ],
          screenshots: [],
        }),
      ).resolves.toMatchObject({ validation: { validation_state: "PASS" } });
    },
  );
});
