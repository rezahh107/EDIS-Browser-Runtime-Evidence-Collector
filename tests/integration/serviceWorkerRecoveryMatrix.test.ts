import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { CaptureCoordinator } from "../../src/background/captureCoordinator";
import { canonicalJson } from "../../src/domain/canonical";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import {
  capturedAt,
  makeCaptureConfiguration,
  makeSession,
  makeSnapshot,
  sessionId,
  snapshotId,
} from "../helpers/fixtures";
import type { CaptureJob } from "../../src/domain/model";

describe("MV3 service worker restart and recovery matrix", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("recovers a fully buffered interrupted job after a worker-like coordinator restart", async () => {
    const repository = new EvidenceRepository();
    const snapshot = makeSnapshot();
    const serialized = canonicalJson(snapshot);
    await repository.putSession({
      ...makeSession(),
      data: { ...makeSession().data, captures: [], status: "CAPTURING" },
    });
    await repository.putJob(makeJob("RECEIVING", 1, 1));
    await repository.putChunk("423e4567-e89b-42d3-a456-426614174000", 0, serialized);

    await new CaptureCoordinator().recoverInterruptedJobs();

    expect((await repository.getJob("423e4567-e89b-42d3-a456-426614174000"))?.status).toBe(
      "COMPLETE",
    );
    expect((await repository.getSnapshot(snapshotId))?.snapshot_id).toBe(snapshotId);
    expect((await repository.getSession(sessionId))?.data.status).toBe("COMPLETE");
  });

  it("fails deterministically when restart recovery sees an incomplete stale job", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession({
      ...makeSession(),
      data: { ...makeSession().data, captures: [], status: "CAPTURING" },
    });
    await repository.putJob({
      ...makeJob("RECEIVING", 2, 1),
      updatedAt: "2026-06-13T09:59:00.000Z",
    });
    await repository.putChunk("423e4567-e89b-42d3-a456-426614174000", 0, "{}");

    await new CaptureCoordinator().recoverInterruptedJobs();

    const job = await repository.getJob("423e4567-e89b-42d3-a456-426614174000");
    expect(job?.status).toBe("INTERRUPTED");
    expect(job?.diagnostics.at(-1)).toMatchObject({
      code: "EDIS_RUNTIME_WORKER_INTERRUPTED",
    });
    expect(await repository.getSnapshot(snapshotId)).toBeUndefined();
  });
});

function makeJob(
  status: CaptureJob["status"],
  expectedChunks: number,
  receivedChunks: number,
): CaptureJob {
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
    status,
    expectedChunks,
    receivedChunks,
    config: makeCaptureConfiguration(),
    diagnostics: [],
  };
}
