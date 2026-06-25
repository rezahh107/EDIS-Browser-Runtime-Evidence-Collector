import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CaptureJob } from "../../src/domain/model";
import { sha256Hex } from "../../src/infrastructure/checksum";
import {
  EvidenceRepository,
  migrateIndexedDbSchema,
} from "../../src/infrastructure/storage/indexedDb";
import {
  capturedAt,
  makeCaptureConfiguration,
  makeSession,
  makeSnapshot,
  sessionId,
  snapshotId,
} from "../helpers/fixtures";

function makeActiveJob(id = "423e4567-e89b-42d3-a456-426614174000"): CaptureJob {
  return {
    id,
    requestId: "523e4567-e89b-42d3-a456-426614174000",
    sessionId,
    snapshotId,
    tabId: 7,
    windowId: 3,
    documentUrl: "https://example.test/",
    documentId: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "ASSEMBLING",
    expectedChunks: 1,
    receivedChunks: 1,
    config: makeCaptureConfiguration(),
    diagnostics: [],
  };
}

describe("IndexedDB buffering", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("grants only one live finalization claim and permits deterministic lease recovery", async () => {
    const repository = new EvidenceRepository();
    await repository.putJob(makeActiveJob("723e4567-e89b-42d3-a456-426614174000"));
    const now = 1_000_000;
    const [first, second] = await Promise.all([
      repository.claimFinalization(
        "723e4567-e89b-42d3-a456-426614174000",
        "owner-a",
        now,
        20_000,
        1,
      ),
      repository.claimFinalization(
        "723e4567-e89b-42d3-a456-426614174000",
        "owner-b",
        now,
        20_000,
        1,
      ),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(
      await repository.claimFinalization(
        "723e4567-e89b-42d3-a456-426614174000",
        "owner-c",
        now + 19_999,
        20_000,
        1,
      ),
    ).toBeNull();
    expect(
      await repository.claimFinalization(
        "723e4567-e89b-42d3-a456-426614174000",
        "owner-c",
        now + 20_000,
        20_000,
        1,
      ),
    ).not.toBeNull();
    await repository.releaseFinalizationClaim("723e4567-e89b-42d3-a456-426614174000", "owner-c");
    expect(
      await repository.claimFinalization(
        "723e4567-e89b-42d3-a456-426614174000",
        "owner-d",
        now + 20_001,
        20_000,
        1,
      ),
    ).not.toBeNull();
  });

  it("does not let a stale interruption overwrite an atomically completed capture", async () => {
    const repository = new EvidenceRepository();
    const activeSession = {
      ...makeSession(),
      data: { ...makeSession().data, captures: [], status: "CAPTURING" as const },
    };
    const activeJob = makeActiveJob();
    await repository.beginCapture(activeJob, activeSession);
    const claimOwner = "owner-complete";
    const claimed = await repository.claimFinalization(
      activeJob.id,
      claimOwner,
      Date.parse("2026-06-13T10:00:00.500Z"),
      20_000,
      1,
    );
    expect(claimed).not.toBeNull();
    const completedJob: CaptureJob = {
      ...(claimed ?? activeJob),
      status: "COMPLETE",
      updatedAt: "2026-06-13T10:00:01.000Z",
    };
    await repository.commitCapture(
      makeSnapshot(),
      null,
      makeSession(),
      completedJob,
      [],
      claimOwner,
    );

    const interruptedJob: CaptureJob = {
      ...activeJob,
      status: "INTERRUPTED",
      updatedAt: "2026-06-13T10:00:02.000Z",
    };
    const terminated = await repository.terminateCapture(interruptedJob, activeSession, []);

    expect(terminated).toBe(false);
    expect((await repository.getJob(activeJob.id))?.status).toBe("COMPLETE");
    expect((await repository.getSnapshot(snapshotId))?.snapshot_id).toBe(snapshotId);
    expect(
      await repository.claimFinalization(
        activeJob.id,
        "owner-after-complete",
        2_000_000,
        20_000,
        1,
      ),
    ).toBeNull();
  });

  it("preserves monotonic identity sequences while clearing user evidence and transient metadata", async () => {
    const repository = new EvidenceRepository();
    const first = await repository.allocateSequence("session");
    const jobId = "823e4567-e89b-42d3-a456-426614174000";
    await repository.putJob(makeActiveJob(jobId));
    expect(
      await repository.claimFinalization(jobId, "owner-clear", 1_000, 20_000, 1),
    ).not.toBeNull();

    await repository.clearAll();

    expect(await repository.allocateSequence("session")).toBe(first + 1);
    await repository.putJob(makeActiveJob(jobId));
    expect(await repository.claimFinalization(jobId, "owner-new", 1_001, 20_000, 1)).not.toBeNull();
  });

  it("stores sessions, snapshots, and ordered chunks", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());
    await repository.putChunk("job", 1, "b");
    await repository.putChunk("job", 0, "a");
    expect((await repository.getSession(sessionId))?.data.session_id).toBe(sessionId);
    expect((await repository.getSnapshot(snapshotId))?.snapshot_id).toBe(snapshotId);
    expect((await repository.listChunks("job")).map((chunk) => chunk.data)).toEqual(["a", "b"]);
    await expect(repository.putChunk("job", 0, "different")).rejects.toThrow(/Conflicting/);
  });

  it("loads screenshots in one session-indexed query and persists resource accounting", async () => {
    const repository = new EvidenceRepository();
    const screenshotBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());
    await repository.putScreenshot({
      snapshotId,
      sessionId,
      mimeType: "image/png",
      bytes: screenshotBytes,
      checksumSha256: "0".repeat(64),
      createdAt: capturedAt,
    });

    expect(await repository.listScreenshotsBySession(sessionId)).toHaveLength(1);
    const usage = await repository.getSessionResourceUsage(sessionId);
    expect(usage.captureCount).toBe(1);
    expect(usage.snapshotBytes).toBeGreaterThan(0);
    expect(usage.screenshotBytes).toBe(4);
    expect(usage.totalBytes).toBe(usage.snapshotBytes + 4);
  });

  it("projects lightweight session summaries without returning every session capture array", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    const summaries = await repository.listSessionSummaries();
    expect(summaries).toEqual([
      expect.objectContaining({
        session_id: sessionId,
        capture_count: makeSession().data.captures.length,
        latest_capture: makeSession().data.captures.at(-1),
      }),
    ]);
  });
});

describe("IndexedDB personal-use stability maintenance", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("renews only the current finalization owner and rejects a stale atomic commit", async () => {
    const repository = new EvidenceRepository();
    const activeSession = {
      ...makeSession(),
      data: { ...makeSession().data, captures: [], status: "CAPTURING" as const },
    };
    const activeJob = makeActiveJob("923e4567-e89b-42d3-a456-426614174000");
    await repository.beginCapture(activeJob, activeSession);
    const claimed = await repository.claimFinalization(activeJob.id, "owner-a", 1_000, 20_000, 1);
    expect(claimed).not.toBeNull();
    expect(await repository.renewFinalizationClaim(activeJob.id, "owner-b", 2_000, 20_000)).toBe(
      false,
    );
    expect(await repository.renewFinalizationClaim(activeJob.id, "owner-a", 2_000, 20_000)).toBe(
      true,
    );

    await repository.releaseFinalizationClaim(activeJob.id, "owner-a");
    expect(
      await repository.claimFinalization(activeJob.id, "owner-b", 2_001, 20_000, 1),
    ).not.toBeNull();
    const completedJob: CaptureJob = {
      ...(claimed ?? activeJob),
      status: "COMPLETE",
      updatedAt: "2026-06-13T10:00:01.000Z",
    };
    await expect(
      repository.commitCapture(makeSnapshot(), null, makeSession(), completedJob, [], "owner-a"),
    ).rejects.toThrow(/claim was lost/i);
    expect(await repository.getSnapshot(snapshotId)).toBeUndefined();
    expect((await repository.getJob(activeJob.id))?.status).toBe("ASSEMBLING");
    expect(await repository.renewFinalizationClaim(activeJob.id, "owner-b", 2_002, 20_000)).toBe(
      true,
    );
  });

  it("tracks chunk count and byte totals without rescanning on every accepted chunk", async () => {
    const repository = new EvidenceRepository();
    const job: CaptureJob = {
      ...makeActiveJob("a23e4567-e89b-42d3-a456-426614174000"),
      status: "RECEIVING",
      expectedChunks: 100,
      receivedChunks: 0,
    };
    await repository.putJob(job);

    let current = job;
    for (let index = 0; index < 100; index += 1) {
      const data = `chunk-${index}`;
      current = await repository.commitChunk(
        current,
        {
          key: `${job.id}:${index.toString().padStart(6, "0")}`,
          jobId: job.id,
          index,
          data,
          sha256: await sha256Hex(new TextEncoder().encode(data)),
          byteLength: new TextEncoder().encode(data).length,
        },
        1_000_000,
      );
    }

    expect(current.receivedChunks).toBe(100);
    expect(await repository.listChunks(job.id)).toHaveLength(100);
    expect(await repository.getChunkAggregate(job.id)).toMatchObject({
      jobId: job.id,
      count: 100,
    });
    const duplicate = await repository.commitChunk(
      current,
      {
        key: `${job.id}:000099`,
        jobId: job.id,
        index: 99,
        data: "chunk-99",
        sha256: await sha256Hex(new TextEncoder().encode("chunk-99")),
        byteLength: new TextEncoder().encode("chunk-99").length,
      },
      1_000_000,
    );
    expect(duplicate.receivedChunks).toBe(100);
    expect((await repository.maintainInternalState(Date.now())).chunkAggregatesRebuilt).toBe(0);
  });

  it("removes orphaned transient state while preserving user evidence and monotonic sequences", async () => {
    const repository = new EvidenceRepository();
    const sequence = await repository.allocateSequence("session");
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());
    await repository.putChunk("orphan-job", 0, "orphan");

    const activeJob = makeActiveJob("b23e4567-e89b-42d3-a456-426614174000");
    await repository.putJob(activeJob);
    await repository.putChunk(activeJob.id, 0, "active");
    await repository.claimFinalization(activeJob.id, "expired-owner", 1_000, 1_000, 1);

    const oldTerminal: CaptureJob = {
      ...makeActiveJob("c23e4567-e89b-42d3-a456-426614174000"),
      status: "FAILED",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    await repository.putJob(oldTerminal);

    const maintenanceNow = Date.parse("2026-06-15T00:00:00.000Z");
    const result = await repository.maintainInternalState(maintenanceNow, 0);
    expect(result.expiredClaimsRemoved).toBe(1);
    expect(result.orphanedChunksRemoved).toBe(1);
    expect(result.chunkAggregatesRebuilt).toBe(1);
    expect(result.terminalJobsRemoved).toBe(1);
    expect(await repository.listChunks("orphan-job")).toEqual([]);
    expect(await repository.listChunks(activeJob.id)).toHaveLength(1);
    expect(await repository.getSession(sessionId)).toBeDefined();
    expect(await repository.getSnapshot(snapshotId)).toBeDefined();
    expect(await repository.getJob(oldTerminal.id)).toBeUndefined();
    expect(await repository.allocateSequence("session")).toBe(sequence + 1);
    expect(
      await repository.claimFinalization(
        activeJob.id,
        "replacement-owner",
        maintenanceNow + 1,
        20_000,
        1,
      ),
    ).not.toBeNull();
  });

  it("skips repeated global maintenance inside the configured interval", async () => {
    const repository = new EvidenceRepository();
    const now = Date.parse("2026-06-15T00:00:00.000Z");
    expect(await repository.maintainInternalStateIfDue(now, 60_000)).not.toBeNull();
    expect(await repository.maintainInternalStateIfDue(now + 1, 60_000)).toBeNull();
    expect(await repository.maintainInternalStateIfDue(now + 60_000, 60_000)).not.toBeNull();
  });
});

describe("IndexedDB v3 to v4 migration", () => {
  it("adds session and status indexes without deleting existing records", async () => {
    const name = "edis-migration-v3-v4";
    await deleteTestDatabase(name);
    const version3 = await openTestDatabase(name, 3, (database) => {
      database.createObjectStore("sessions", { keyPath: "data.session_id" });
      const snapshots = database.createObjectStore("snapshots", { keyPath: "snapshot_id" });
      snapshots.createIndex("sessionId", "session_id", { unique: false });
      database.createObjectStore("screenshots", { keyPath: "snapshotId" });
      const jobs = database.createObjectStore("jobs", { keyPath: "id" });
      jobs.createIndex("tabId", "tabId", { unique: false });
      jobs.createIndex("sessionId", "sessionId", { unique: false });
      const chunks = database.createObjectStore("chunks", { keyPath: "key" });
      chunks.createIndex("jobId", "jobId", { unique: false });
      database.createObjectStore("metadata", { keyPath: "key" });
    });
    const write = version3.transaction(["screenshots", "jobs"], "readwrite");
    write.objectStore("screenshots").put({
      snapshotId: "snapshot-existing",
      sessionId: "session-existing",
      bytes: new ArrayBuffer(1),
    });
    write
      .objectStore("jobs")
      .put({ id: "job-existing", status: "RECEIVING", sessionId: "session-existing" });
    await transactionDone(write);
    version3.close();

    const version4 = await openTestDatabase(name, 4, (database, transaction, oldVersion) => {
      migrateIndexedDbSchema(database, transaction, oldVersion);
    });
    expect(
      version4
        .transaction("screenshots")
        .objectStore("screenshots")
        .indexNames.contains("sessionId"),
    ).toBe(true);
    expect(version4.transaction("jobs").objectStore("jobs").indexNames.contains("status")).toBe(
      true,
    );
    const read = version4.transaction(["screenshots", "jobs"], "readonly");
    expect(
      await requestValue(read.objectStore("screenshots").get("snapshot-existing")),
    ).toBeDefined();
    expect(await requestValue(read.objectStore("jobs").get("job-existing"))).toBeDefined();
    await transactionDone(read);
    version4.close();
    await deleteTestDatabase(name);
  });
});

function openTestDatabase(
  name: string,
  version: number,
  upgrade: (database: IDBDatabase, transaction: IDBTransaction, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => {
      if (!request.transaction) throw new Error("Migration transaction unavailable.");
      upgrade(request.result, request.transaction, event.oldVersion);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function deleteTestDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}
