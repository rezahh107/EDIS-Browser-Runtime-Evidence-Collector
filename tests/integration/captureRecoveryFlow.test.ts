import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureCoordinator } from "../../src/background/captureCoordinator";
import { canonicalJson } from "../../src/domain/canonical";
import { DEFAULT_PREFERENCES, type CaptureJob, type CaptureSession } from "../../src/domain/model";
import { sha256Hex } from "../../src/infrastructure/checksum";
import { EvidenceRepository, type ChunkRecord } from "../../src/infrastructure/storage/indexedDb";
import { capturedAt, makeSession, makeSnapshot, sessionId, snapshotId } from "../helpers/fixtures";

beforeAll(() => {
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-id", getManifest: () => ({ version: "1.2.0" }) },
    tabs: { query: vi.fn(async () => []) },
    scripting: { executeScript: vi.fn(async () => []) },
    sidePanel: {},
  });
});

describe("persisted capture recovery flow", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("finalizes a complete persisted capture exactly once under concurrent recovery", async () => {
    const { repository, job } = await prepareRecoverableCapture();
    const coordinator = new CaptureCoordinator();

    await Promise.all([coordinator.recoverInterruptedJobs(), coordinator.recoverInterruptedJobs()]);

    const storedJob = await repository.getJob(job.id);
    expect(storedJob?.status).toBe("COMPLETE");
    expect(
      storedJob?.diagnostics.some((item) => item.code === "EDIS_RUNTIME_SERIALIZATION_FAILED"),
    ).toBe(false);
    expect(await repository.listChunks(job.id)).toEqual([]);
    expect((await repository.getSession(sessionId))?.data.captures).toHaveLength(1);
  });

  it("recovers a complete canonical chunk set into one committed snapshot", async () => {
    const repository = new EvidenceRepository();
    const baseSession = makeSession();
    const session: CaptureSession = {
      ...baseSession,
      data: { ...baseSession.data, captures: [], status: "CAPTURING" },
    };
    await repository.putSession(session);

    const serialized = canonicalJson(makeSnapshot());
    const bytes = new TextEncoder().encode(serialized);
    const job: CaptureJob = {
      id: "323e4567-e89b-52d3-a456-426614174000",
      requestId: "423e4567-e89b-52d3-a456-426614174000",
      sessionId,
      snapshotId,
      tabId: 1,
      windowId: 1,
      documentUrl: "https://example.test/",
      documentId: "document-1",
      createdAt: capturedAt,
      updatedAt: capturedAt,
      status: "RECEIVING",
      expectedChunks: 1,
      receivedChunks: 0,
      config: {
        ...DEFAULT_PREFERENCES,
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
    await repository.putJob(job);
    const chunk: ChunkRecord = {
      key: `${job.id}:000000`,
      jobId: job.id,
      index: 0,
      data: serialized,
      sha256: await sha256Hex(bytes),
      byteLength: bytes.length,
    };
    await repository.commitChunk(job, chunk, job.config.maxSnapshotBytes);

    await new CaptureCoordinator().recoverInterruptedJobs();

    expect((await repository.getJob(job.id))?.status).toBe("COMPLETE");
    expect((await repository.getSnapshot(snapshotId))?.snapshot_id).toBe(snapshotId);
    expect((await repository.getSession(sessionId))?.data.captures).toHaveLength(1);
    expect(await repository.listChunks(job.id)).toEqual([]);
  });

  it("accepts a legacy zero-hash chunk only when the supplied full checksum verifies", async () => {
    const { repository, job, serialized, bytes } = await prepareLegacyCapture(
      "323e4567-e89b-52d3-a456-426614174010",
    );
    await insertLegacyChunk(job.id, serialized, bytes.length);

    const completed = await new CaptureCoordinator().complete(
      job.tabId,
      job.documentUrl,
      job.documentId,
      {
        jobId: job.id,
        total: 1,
        snapshotSha256: await sha256Hex(bytes),
        byteLength: bytes.length,
      },
    );

    expect(completed.status).toBe("COMPLETE");
    const warning = (await repository.getSnapshot(snapshotId))?.diagnostics.find(
      (item) => item.code === "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
    );
    expect(warning?.severity).toBe("WARNING");
    expect(warning?.scope).toBe("OPERATIONAL");
    expect(warning?.context).toEqual({ reason: "legacy_chunk_hash_absent", chunk_count: 1 });
  });

  it("fails closed when reboot recovery sees a legacy chunk without a full checksum", async () => {
    const { repository, job, serialized, bytes } = await prepareLegacyCapture(
      "323e4567-e89b-52d3-a456-426614174011",
    );
    await insertLegacyChunk(job.id, serialized, bytes.length);

    await new CaptureCoordinator().recoverInterruptedJobs();

    const stored = await repository.getJob(job.id);
    expect(stored?.status).toBe("FAILED");
    expect(
      stored?.diagnostics.some((item) => item.code === "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT"),
    ).toBe(true);
    expect(await repository.getSnapshot(snapshotId)).toBeUndefined();
  });
});

async function prepareRecoverableCapture(): Promise<{
  repository: EvidenceRepository;
  job: CaptureJob;
}> {
  const repository = new EvidenceRepository();
  const baseSession = makeSession();
  const session: CaptureSession = {
    ...baseSession,
    data: { ...baseSession.data, captures: [], status: "CAPTURING" },
  };
  await repository.putSession(session);

  const serialized = canonicalJson(makeSnapshot());
  const bytes = new TextEncoder().encode(serialized);
  const job: CaptureJob = {
    id: "323e4567-e89b-52d3-a456-426614174001",
    requestId: "423e4567-e89b-52d3-a456-426614174001",
    sessionId,
    snapshotId,
    tabId: 1,
    windowId: 1,
    documentUrl: "https://example.test/",
    documentId: "document-1",
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "RECEIVING",
    expectedChunks: 1,
    receivedChunks: 0,
    config: {
      ...DEFAULT_PREFERENCES,
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
  await repository.putJob(job);
  const chunk: ChunkRecord = {
    key: `${job.id}:000000`,
    jobId: job.id,
    index: 0,
    data: serialized,
    sha256: await sha256Hex(bytes),
    byteLength: bytes.length,
  };
  await repository.commitChunk(job, chunk, job.config.maxSnapshotBytes);
  return { repository, job };
}

async function prepareLegacyCapture(id: string): Promise<{
  repository: EvidenceRepository;
  job: CaptureJob;
  serialized: string;
  bytes: Uint8Array;
}> {
  const repository = new EvidenceRepository();
  const baseSession = makeSession();
  await repository.putSession({
    ...baseSession,
    data: { ...baseSession.data, captures: [], status: "CAPTURING" },
  });
  const serialized = canonicalJson(makeSnapshot());
  const bytes = new TextEncoder().encode(serialized);
  const job: CaptureJob = {
    id,
    requestId: id.replace("323e", "423e"),
    sessionId,
    snapshotId,
    tabId: 1,
    windowId: 1,
    documentUrl: "https://example.test/",
    documentId: "document-1",
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "RECEIVING",
    expectedChunks: 1,
    receivedChunks: 1,
    config: {
      ...DEFAULT_PREFERENCES,
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
  await repository.putJob(job);
  return { repository, job, serialized, bytes };
}

async function insertLegacyChunk(jobId: string, data: string, byteLength: number): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("edis-runtime-collector", 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
  const transaction = database.transaction("chunks", "readwrite");
  transaction.objectStore("chunks").put({
    key: `${jobId}:000000`,
    jobId,
    index: 0,
    data,
    sha256: "0".repeat(64),
    byteLength,
  });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
  database.close();
}
