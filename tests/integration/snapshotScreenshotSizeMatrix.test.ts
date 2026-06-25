import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { sha256Hex } from "../../src/infrastructure/checksum";
import { EvidenceRepository, type ChunkRecord } from "../../src/infrastructure/storage/indexedDb";
import { MAX_SCREENSHOT_BYTES } from "../../src/domain/resourceLimits";
import { capturedAt, makeSession, makeSnapshot, sessionId, snapshotId } from "../helpers/fixtures";
import type { CaptureJob } from "../../src/domain/model";

describe("snapshot and screenshot size matrix", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it.each([
    ["small", 32, 1024, true],
    ["large", 512, 1024, true],
    ["near-limit", 1024, 1024, true],
    ["oversized", 1025, 1024, false],
  ] as const)(
    "handles %s snapshot chunks deterministically",
    async (_label, bytes, limit, accepted) => {
      const repository = new EvidenceRepository();
      const job = makeJob(limit);
      await repository.putJob(job);
      const data = "x".repeat(bytes);
      const record: ChunkRecord = {
        key: `${job.id}:000000`,
        jobId: job.id,
        index: 0,
        data,
        sha256: await sha256Hex(new TextEncoder().encode(data)),
        byteLength: bytes,
      };

      if (accepted) {
        const updated = await repository.commitChunk({ ...job, expectedChunks: 1 }, record, limit);
        expect(updated.receivedChunks).toBe(1);
        expect(await repository.getChunkAggregate(job.id)).toMatchObject({ bytes, count: 1 });
      } else {
        await expect(
          repository.commitChunk({ ...job, expectedChunks: 1 }, record, limit),
        ).rejects.toThrow(/snapshot size limit/i);
        expect(await repository.listChunks(job.id)).toEqual([]);
      }
    },
  );

  it("rejects oversized screenshots before a package can look valid", async () => {
    const oversized = {
      snapshotId,
      sessionId,
      mimeType: "image/png" as const,
      bytes: new ArrayBuffer(MAX_SCREENSHOT_BYTES + 1),
      checksumSha256: "0".repeat(64),
      createdAt: capturedAt,
    };

    await expect(
      buildEvidencePackage({
        session: makeSession(),
        snapshots: [makeSnapshot()],
        screenshots: [oversized],
      }),
    ).rejects.toThrow(/stored screenshot failed runtime validation/i);
  });
});

function makeJob(maxSnapshotBytes: number): CaptureJob {
  return {
    id: "423e4567-e89b-42d3-a456-426614174000",
    requestId: "523e4567-e89b-42d3-a456-426614174000",
    sessionId,
    snapshotId,
    tabId: 7,
    windowId: 3,
    documentUrl: "https://example.test/",
    documentId: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "RECEIVING",
    expectedChunks: 1,
    receivedChunks: 0,
    config: {
      schemaVersion: 4,
      captureProfile: "STANDARD",
      captureIntent: "GENERAL_AUDIT",
      redactionMode: "STRICT",
      includeScreenshot: false,
      includeHiddenElements: false,
      includePath: false,
      includePageTitle: false,
      includeColors: false,
      includeTextPreview: false,
      includeTextShape: true,
      includeInteractionFacts: true,
      includeRelationshipGraph: true,
      prepareFullDocumentImages: false,
      readinessHardTimeoutMs: 500,
      maxTextPreviewChars: 160,
      retainAfterExport: false,
      maxElements: 750,
      maxDepth: 24,
      maxSnapshotBytes,
      sessionId,
      snapshotId,
      observationIndex: 0,
      userLabel: "Desktop",
      evidenceLabel: "USER_LABELED_VIEWPORT",
      requestedProfileId: "DESKTOP",
      workflowMode: "RUNTIME_EVIDENCE",
      expectedPageFingerprint: null,
      expectedViewportWidth: null,
      capturedAt,
      bindingContext: null,
    },
    diagnostics: [],
  };
}
