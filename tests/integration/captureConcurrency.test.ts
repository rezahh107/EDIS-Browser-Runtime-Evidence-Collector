import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CaptureJob,
  CaptureSession,
  CaptureSummary,
  RuntimeSnapshot,
} from "../../src/domain/model";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import {
  capturedAt,
  makeCaptureConfiguration,
  makeSession,
  makeSnapshot,
  sessionId,
  snapshotId,
} from "../helpers/fixtures";

const secondSnapshotId = "223e4567-e89b-42d3-a456-426614174001";
const thirdSnapshotId = "223e4567-e89b-42d3-a456-426614174002";

function emptyCapturingSession(): CaptureSession {
  const session = makeSession();
  return {
    ...session,
    data: { ...session.data, captures: [], status: "CAPTURING" },
  };
}

function jobFor(snapshot: string, tabId: number, observationIndex: number): CaptureJob {
  return {
    id: `423e4567-e89b-42d3-a456-${snapshot.slice(-12)}`,
    requestId: `523e4567-e89b-42d3-a456-${snapshot.slice(-12)}`,
    sessionId,
    snapshotId: snapshot,
    tabId,
    windowId: 3,
    documentUrl: `https://example.test/${String(tabId)}`,
    documentId: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "PREPARED",
    expectedChunks: null,
    receivedChunks: 0,
    config: {
      ...makeCaptureConfiguration(),
      sessionId,
      snapshotId: snapshot,
      observationIndex,
    },
    diagnostics: [],
  };
}

function snapshotFor(
  snapshot: string,
  observationIndex: number,
  captured_at: string,
): RuntimeSnapshot {
  return {
    ...makeSnapshot(),
    snapshot_id: snapshot,
    observation_index: observationIndex,
    captured_at,
  };
}

function summaryFor(snapshot: RuntimeSnapshot): CaptureSummary {
  const base = makeSession().data.captures[0];
  if (!base) throw new Error("Fixture session summary is missing.");
  return {
    ...base,
    snapshot_id: snapshot.snapshot_id,
    captured_at: snapshot.captured_at,
    label: snapshot.viewport.user_label,
    actual_width: snapshot.viewport.inner_width,
    actual_height: snapshot.viewport.inner_height,
    status: snapshot.status === "AVAILABLE" ? "COMPLETE" : "PARTIAL",
    completeness_status: snapshot.capture_completeness.status,
  };
}

async function claim(
  repository: EvidenceRepository,
  job: CaptureJob,
  owner: string,
): Promise<CaptureJob> {
  const claimed = await repository.claimFinalization(job.id, owner, 1_000_000, 20_000, 1);
  if (!claimed) throw new Error(`Could not claim ${job.id}`);
  return claimed;
}

describe("capture concurrency hardening", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("permits only one concurrent same-tab capture start", async () => {
    const repository = new EvidenceRepository();
    const session = emptyCapturingSession();
    await repository.putSession(session);
    const first = jobFor(snapshotId, 7, 0);
    const second = jobFor(secondSnapshotId, 7, 0);

    const results = await Promise.allSettled([
      repository.beginCapture(first, session),
      repository.beginCapture(second, session),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await repository.listJobsByTab(7)).toHaveLength(1);
  });

  it("rejects a second active capture in the same session even on another tab", async () => {
    const repository = new EvidenceRepository();
    const session = emptyCapturingSession();
    await repository.putSession(session);
    await repository.beginCapture(jobFor(snapshotId, 7, 0), session);

    await expect(repository.beginCapture(jobFor(secondSnapshotId, 8, 0), session)).rejects.toThrow(
      /active for this session/i,
    );
    expect(await repository.listJobsBySession(sessionId)).toHaveLength(1);
  });

  it("rejects stale observation-index reservations against the stored session", async () => {
    const repository = new EvidenceRepository();
    const completedSession = makeSession();
    await repository.putSession(completedSession);

    await expect(
      repository.beginCapture(jobFor(secondSnapshotId, 8, 0), completedSession),
    ).rejects.toThrow(/observation index was reserved/i);
  });

  it("merges independently finalized session summaries without losing either capture", async () => {
    const repository = new EvidenceRepository();
    const session = emptyCapturingSession();
    await repository.putSession(session);

    const firstSnapshot = snapshotFor(snapshotId, 0, "2026-06-13T10:00:00.000Z");
    const secondSnapshot = snapshotFor(secondSnapshotId, 1, "2026-06-13T10:00:01.000Z");
    const firstJob = { ...jobFor(snapshotId, 7, 0), status: "RECEIVING" as const };
    const secondJob = { ...jobFor(secondSnapshotId, 8, 1), status: "RECEIVING" as const };
    await repository.putJob(firstJob);
    await repository.putJob(secondJob);
    const claimedFirst = await claim(repository, firstJob, "owner-a");
    const claimedSecond = await claim(repository, secondJob, "owner-b");

    const firstSession: CaptureSession = {
      ...session,
      data: { ...session.data, captures: [summaryFor(firstSnapshot)], status: "COMPLETE" },
    };
    const secondSession: CaptureSession = {
      ...session,
      data: { ...session.data, captures: [summaryFor(secondSnapshot)], status: "COMPLETE" },
    };

    await Promise.all([
      repository.commitCapture(
        firstSnapshot,
        null,
        firstSession,
        { ...claimedFirst, status: "COMPLETE", updatedAt: "2026-06-13T10:00:02.000Z" },
        [],
        "owner-a",
      ),
      repository.commitCapture(
        secondSnapshot,
        null,
        secondSession,
        { ...claimedSecond, status: "COMPLETE", updatedAt: "2026-06-13T10:00:03.000Z" },
        [],
        "owner-b",
      ),
    ]);

    const storedSession = await repository.getSession(sessionId);
    expect(storedSession?.data.captures.map((capture) => capture.snapshot_id)).toEqual([
      snapshotId,
      secondSnapshotId,
    ]);
    expect(await repository.getSnapshot(snapshotId)).toBeDefined();
    expect(await repository.getSnapshot(secondSnapshotId)).toBeDefined();
  });

  it("keeps finalization merge deterministic when a later commit replaces the same summary", async () => {
    const repository = new EvidenceRepository();
    const session = emptyCapturingSession();
    await repository.putSession(session);
    const snapshot = snapshotFor(thirdSnapshotId, 0, "2026-06-13T10:00:04.000Z");
    const activeJob = { ...jobFor(thirdSnapshotId, 9, 0), status: "RECEIVING" as const };
    await repository.putJob(activeJob);
    const claimed = await claim(repository, activeJob, "owner-replace");
    const proposedSession: CaptureSession = {
      ...session,
      data: { ...session.data, captures: [summaryFor(snapshot)], status: "COMPLETE" },
    };

    await repository.commitCapture(
      snapshot,
      null,
      proposedSession,
      { ...claimed, status: "COMPLETE", updatedAt: "2026-06-13T10:00:05.000Z" },
      [],
      "owner-replace",
    );

    const stored = await repository.getSession(sessionId);
    expect(stored?.data.captures).toHaveLength(1);
    expect(stored?.data.captures[0]?.snapshot_id).toBe(thirdSnapshotId);
  });
});
