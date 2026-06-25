import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getExportPreflight } from "../../src/application/exportUseCase";
import { CaptureCoordinator } from "../../src/background/captureCoordinator";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import {
  DB_NAME,
  DB_VERSION,
  EvidenceRepository,
  LEGACY_UNVERIFIED_CHUNK_HASH,
  migrateIndexedDbSchema,
} from "../../src/infrastructure/storage/indexedDb";
import {
  capturedAt,
  makeCaptureConfiguration,
  makeSession,
  makeSnapshot,
  sessionId,
} from "../helpers/fixtures";

const alternateSessionId = "623e4567-e89b-42d3-a456-426614174000";
const alternateSnapshotId = "623e4567-e89b-42d3-a456-426614174001";

describe("IndexedDB release-grade storage reliability matrix", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("covers fresh storage with actionable empty state", async () => {
    const repository = new EvidenceRepository();
    const projection = await repository.listSessionSummaryProjection();
    expect(projection).toMatchObject({ summaries: [], corruptRecordCount: 0, diagnostics: [] });
  });

  it("covers existing storage and keeps export preflight valid-looking only for valid records", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());

    expect(await repository.listSessionSummaries()).toHaveLength(1);
    const preflight = await getExportPreflight(sessionId);
    expect(preflight.blockingErrors).toEqual([]);
  });

  it("covers migrated storage and normalizes legacy null workflow mode without deleting evidence", async () => {
    const databaseName = "edis-storage-matrix-migrated";
    await deleteDatabase(databaseName);
    const legacy = await openDatabase(databaseName, 3, (database) => {
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
    legacy.close();

    const migrated = await openDatabase(databaseName, 4, (database, transaction, oldVersion) => {
      migrateIndexedDbSchema(database, transaction, oldVersion);
    });
    expect(migrated.objectStoreNames.contains("sessions")).toBe(true);
    expect(migrated.objectStoreNames.contains("metadata")).toBe(true);
    migrated.close();
    await deleteDatabase(databaseName);
  });

  it("covers partial storage and blocks valid-looking export when a session summary lacks a snapshot", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());

    const preflight = await getExportPreflight(sessionId);
    expect(preflight.blockingErrors).toContain("NO_RUNTIME_OBSERVATIONS");
    await expect(
      buildEvidencePackage({ session: makeSession(), snapshots: [], screenshots: [] }),
    ).rejects.toThrow(/requires at least one snapshot/i);
  });

  it("covers corrupted current records and preserves valid sessions in the listing projection", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await putRaw("sessions", {
      data: {
        session_id: alternateSessionId,
        name: "Corrupt current session",
        created_at: capturedAt,
        status: "COMPLETE",
      },
    });

    const projection = await repository.listSessionSummaryProjection();
    expect(projection.summaries.map((summary) => summary.session_id)).toEqual([sessionId]);
    expect(projection.corruptRecordCount).toBe(1);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: "EDIS_RUNTIME_STORAGE_READ_FAILED",
        failure_boundary: "MIGRATION_STORAGE_READ_FAILURE",
        key: alternateSessionId,
      }),
    ]);
    await expect(repository.listSessions()).rejects.toThrow(/corrupt stored capture session list/i);
  });

  it("covers corrupted legacy records without making them exportable", async () => {
    const repository = new EvidenceRepository();
    await putRaw("sessions", {
      schema_id: "urn:edis:schema:browser:capture-session",
      schema_version: "1.0.0",
      artifact_type: "capture_session",
      producer: { product: "EDIS Browser Runtime Evidence Collector", version: "1.5.0" },
      captured_at: capturedAt,
      canonicalization: { profile: "EDIS-CJ-1", hash_algorithm: "sha256" },
      data: {
        session_id: sessionId,
        observation_set_id: "323e4567-e89b-42d3-a456-426614174000",
        name: "Corrupt legacy session",
        created_at: capturedAt,
        extension_version: "1.5.0",
        captures: "not-an-array",
        status: "COMPLETE",
      },
      diagnostics: [],
    });

    const projection = await repository.listSessionSummaryProjection();
    expect(projection.summaries).toEqual([]);
    expect(projection.corruptRecordCount).toBe(1);
    await expect(repository.getSession(sessionId)).rejects.toThrow(
      /corrupt stored capture session/i,
    );
  });

  it("covers legacy zero-hash chunks as deterministic failure unless a full checksum is available", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putJob({
      id: "423e4567-e89b-42d3-a456-426614174000",
      requestId: "523e4567-e89b-42d3-a456-426614174000",
      sessionId,
      snapshotId: alternateSnapshotId,
      tabId: 7,
      windowId: 3,
      documentUrl: "https://example.test/",
      documentId: null,
      createdAt: capturedAt,
      updatedAt: capturedAt,
      status: "RECEIVING",
      expectedChunks: 1,
      receivedChunks: 1,
      config: { ...makeSnapshotConfiguration(), snapshotId: alternateSnapshotId },
      diagnostics: [],
    });
    await putRaw("chunks", {
      key: "423e4567-e89b-42d3-a456-426614174000:000000",
      jobId: "423e4567-e89b-42d3-a456-426614174000",
      index: 0,
      data: "{}",
      sha256: LEGACY_UNVERIFIED_CHUNK_HASH,
      byteLength: 2,
      integrityStatus: "LEGACY_UNVERIFIED",
    });

    await new CaptureCoordinator().recoverInterruptedJobs();
    const job = await repository.getJob("423e4567-e89b-42d3-a456-426614174000");
    expect(job?.status).toBe("FAILED");
    expect(job?.diagnostics.at(-1)).toMatchObject({
      code: "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
    });
    expect(await repository.getSnapshot(alternateSnapshotId)).toBeUndefined();
  });

  it("covers one corrupt record among otherwise valid sessions without hiding the boundary", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putSession({
      ...makeSession(),
      data: {
        ...makeSession().data,
        session_id: alternateSessionId,
        captures: [],
        name: "Valid second session",
      },
    });
    await putRaw("sessions", { data: { session_id: "bad-session", created_at: "bad" } });

    const projection = await repository.listSessionSummaryProjection();
    expect(projection.summaries).toHaveLength(2);
    expect(projection.corruptRecordCount).toBe(1);
  });
});

function makeSnapshotConfiguration() {
  return { ...makeCaptureConfiguration(), snapshotId: alternateSnapshotId };
}

async function putRaw(storeName: string, value: unknown): Promise<void> {
  const database = await openDatabase(DB_NAME, DB_VERSION, (database, transaction, oldVersion) => {
    migrateIndexedDbSchema(database, transaction, oldVersion);
  });
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  database.close();
}

function openDatabase(
  name: string,
  version: number,
  upgrade: (database: IDBDatabase, transaction: IDBTransaction | null, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) =>
      upgrade(request.result, request.transaction, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}
