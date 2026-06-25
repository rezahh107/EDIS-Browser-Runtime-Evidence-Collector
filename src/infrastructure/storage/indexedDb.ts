import type {
  CaptureJob,
  CaptureSession,
  CaptureSessionSummary,
  CaptureSummary,
  RuntimeSnapshot,
  ScreenshotRecord,
  SessionSourceBindingState,
} from "../../domain/model";
import {
  isCaptureJob,
  isCaptureSession,
  isRuntimeSnapshot,
  isScreenshotRecord,
} from "../../domain/validation";
import { canonicalJson } from "../../domain/canonical";
import { sha256Hex } from "../checksum";
import { STORAGE_MAINTENANCE_INTERVAL_MS } from "../../domain/resourceLimits";

export const DB_NAME = "edis-runtime-collector";
export const DB_VERSION = 4;
const DEFAULT_TERMINAL_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const LAST_MAINTENANCE_KEY = "maintenance:last-run";
export const LEGACY_UNVERIFIED_CHUNK_HASH = "0".repeat(64);

const ACTIVE_CAPTURE_STATUSES = new Set<CaptureJob["status"]>([
  "PREPARED",
  "INJECTED",
  "RECEIVING",
  "ASSEMBLING",
]);

export interface ChunkRecord {
  readonly key: string;
  readonly jobId: string;
  readonly index: number;
  readonly data: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly integrityStatus?: "VERIFIED" | "LEGACY_UNVERIFIED";
}

interface MetadataRecord {
  readonly key: string;
  readonly value: number;
}

interface SessionResourceUsageRecord {
  readonly key: string;
  readonly sessionId: string;
  readonly snapshotBytes: number;
  readonly screenshotBytes: number;
  readonly captureCount: number;
}

interface SnapshotResourceUsageRecord {
  readonly key: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly snapshotBytes: number;
  readonly screenshotBytes: number;
}

export interface SessionResourceUsage {
  readonly snapshotBytes: number;
  readonly screenshotBytes: number;
  readonly totalBytes: number;
  readonly captureCount: number;
}

interface FinalizationClaimRecord {
  readonly key: string;
  readonly owner: string;
  readonly expiresAt: number;
}

export interface ChunkAggregateRecord {
  readonly key: string;
  readonly jobId: string;
  readonly count: number;
  readonly bytes: number;
}

export interface StorageMaintenanceResult {
  readonly expiredClaimsRemoved: number;
  readonly orphanedChunksRemoved: number;
  readonly chunkAggregatesRebuilt: number;
  readonly terminalJobsRemoved: number;
}

export class FinalizationClaimLostError extends Error {
  constructor() {
    super("Capture finalization claim was lost.");
    this.name = "FinalizationClaimLostError";
  }
}

export class EvidenceRepository {
  async allocateSequence(scope: string): Promise<number> {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(scope)) throw new Error("Invalid sequence scope.");
    const database = await openDatabase();
    const transaction = database.transaction("metadata", "readwrite");
    const store = transaction.objectStore("metadata");
    const key = `sequence:${scope}`;
    const existing = await requestResult<MetadataRecord | undefined>(store.get(key));
    const next = (existing?.value ?? 0) + 1;
    if (!Number.isSafeInteger(next) || next <= 0) {
      transaction.abort();
      throw new Error("Sequence allocation overflowed.");
    }
    store.put({ key, value: next } satisfies MetadataRecord);
    await transactionComplete(transaction);
    return next;
  }

  async claimFinalization(
    jobId: string,
    owner: string,
    nowMs: number,
    leaseMs: number,
    totalChunks: number,
  ): Promise<CaptureJob | null> {
    validateFinalizationClaimInput(jobId, owner, nowMs, leaseMs);
    if (!Number.isSafeInteger(totalChunks) || totalChunks <= 0 || totalChunks > 10_000)
      throw new Error("Invalid finalization chunk count.");
    const database = await openDatabase();
    const transaction = database.transaction(["jobs", "metadata"], "readwrite");
    const jobStore = transaction.objectStore("jobs");
    const metadataStore = transaction.objectStore("metadata");
    const storedJob = await requestResult<unknown>(jobStore.get(jobId));
    if (storedJob === undefined) {
      await transactionComplete(transaction);
      return null;
    }
    const currentJob = normalizeStoredJob(storedJob);
    if (!ACTIVE_CAPTURE_STATUSES.has(currentJob.status)) {
      await transactionComplete(transaction);
      return null;
    }
    const key = finalizationClaimKey(jobId);
    const existing = await requestResult<FinalizationClaimRecord | undefined>(
      metadataStore.get(key),
    );
    if (existing && isFinalizationClaimRecord(existing) && existing.expiresAt > nowMs) {
      await transactionComplete(transaction);
      return null;
    }
    const claimedJob: CaptureJob = {
      ...currentJob,
      status: "ASSEMBLING",
      expectedChunks: currentJob.expectedChunks ?? totalChunks,
      updatedAt: new Date(nowMs).toISOString(),
    };
    metadataStore.put({
      key,
      owner,
      expiresAt: nowMs + leaseMs,
    } satisfies FinalizationClaimRecord);
    jobStore.put(claimedJob);
    await transactionComplete(transaction);
    return claimedJob;
  }

  async renewFinalizationClaim(
    jobId: string,
    owner: string,
    nowMs: number,
    leaseMs: number,
  ): Promise<boolean> {
    validateFinalizationClaimInput(jobId, owner, nowMs, leaseMs);
    const database = await openDatabase();
    const transaction = database.transaction(["jobs", "metadata"], "readwrite");
    const jobStore = transaction.objectStore("jobs");
    const metadataStore = transaction.objectStore("metadata");
    const [storedJob, storedClaim] = await Promise.all([
      requestResult<unknown>(jobStore.get(jobId)),
      requestResult<FinalizationClaimRecord | undefined>(
        metadataStore.get(finalizationClaimKey(jobId)),
      ),
    ]);
    if (storedJob === undefined) {
      await transactionComplete(transaction);
      return false;
    }
    const currentJob = normalizeStoredJob(storedJob);
    if (
      currentJob.status !== "ASSEMBLING" ||
      !storedClaim ||
      !isFinalizationClaimRecord(storedClaim) ||
      storedClaim.owner !== owner
    ) {
      await transactionComplete(transaction);
      return false;
    }
    metadataStore.put({
      key: finalizationClaimKey(jobId),
      owner,
      expiresAt: nowMs + leaseMs,
    } satisfies FinalizationClaimRecord);
    await transactionComplete(transaction);
    return true;
  }

  async releaseFinalizationClaim(jobId: string, owner: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction("metadata", "readwrite");
    const store = transaction.objectStore("metadata");
    const key = finalizationClaimKey(jobId);
    const existing = await requestResult<FinalizationClaimRecord | undefined>(store.get(key));
    if (existing && isFinalizationClaimRecord(existing) && existing.owner === owner)
      store.delete(key);
    await transactionComplete(transaction);
  }

  async putSession(session: CaptureSession): Promise<void> {
    if (!isCaptureSession(session)) throw new Error("Invalid capture session write.");
    await this.put("sessions", session);
  }

  async getSession(id: string): Promise<CaptureSession | undefined> {
    const value = await this.get<unknown>("sessions", id);
    if (value === undefined) return undefined;
    if (!isCaptureSession(value)) throw new Error("Corrupt stored capture session.");
    return value;
  }

  async listSessions(): Promise<readonly CaptureSession[]> {
    const values = await this.getAll<unknown>("sessions");
    if (!values.every(isCaptureSession)) throw new Error("Corrupt stored capture session list.");
    return values;
  }

  async listSessionSummaries(): Promise<readonly CaptureSessionSummary[]> {
    return (await this.listSessionSummaryProjection()).summaries;
  }

  async listSessionSummaryProjection(): Promise<
    Readonly<{
      summaries: readonly CaptureSessionSummary[];
      corruptRecordCount: number;
      diagnostics: readonly {
        readonly code: string;
        readonly failure_boundary: string;
        readonly key: string;
      }[];
    }>
  > {
    const database = await openDatabase();
    const transaction = database.transaction("sessions", "readonly");
    const summaries: CaptureSessionSummary[] = [];
    const diagnostics: {
      readonly code: string;
      readonly failure_boundary: string;
      readonly key: string;
    }[] = [];
    await iterateCursor(transaction.objectStore("sessions").openCursor(), (cursor) => {
      try {
        const session = normalizeStoredSession(cursor.value);
        summaries.push({
          session_id: session.data.session_id,
          name: session.data.name,
          created_at: session.data.created_at,
          status: session.data.status,
          workflow_mode: session.data.workflow_mode,
          capture_count: session.data.captures.length,
          latest_capture: session.data.captures.at(-1) ?? null,
        });
      } catch {
        diagnostics.push({
          code: "EDIS_RUNTIME_STORAGE_READ_FAILED",
          failure_boundary: "MIGRATION_STORAGE_READ_FAILURE",
          key: indexedDbKeyToDiagnosticString(cursor.key),
        });
      }
    });
    await transactionComplete(transaction);
    summaries.sort(
      (left, right) =>
        compareStrings(right.created_at, left.created_at) ||
        compareStrings(left.session_id, right.session_id),
    );
    return { summaries, corruptRecordCount: diagnostics.length, diagnostics };
  }

  async putSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    if (!isRuntimeSnapshot(snapshot)) throw new Error("Invalid runtime snapshot write.");
    await this.put("snapshots", snapshot);
  }

  async getSnapshot(id: string): Promise<RuntimeSnapshot | undefined> {
    const value = await this.get<unknown>("snapshots", id);
    if (value === undefined) return undefined;
    if (!isRuntimeSnapshot(value)) throw new Error("Corrupt stored runtime snapshot.");
    return value;
  }

  async listSnapshotsBySession(sessionId: string): Promise<readonly RuntimeSnapshot[]> {
    const values = await this.getByIndex<unknown>("snapshots", "sessionId", sessionId);
    if (!values.every(isRuntimeSnapshot)) throw new Error("Corrupt stored runtime snapshot list.");
    return values;
  }

  async putScreenshot(record: ScreenshotRecord): Promise<void> {
    if (!isScreenshotRecord(record)) throw new Error("Invalid screenshot write.");
    await this.put("screenshots", record);
  }

  async getScreenshot(snapshotId: string): Promise<ScreenshotRecord | undefined> {
    const value = await this.get<unknown>("screenshots", snapshotId);
    if (value === undefined) return undefined;
    if (!isScreenshotRecord(value)) throw new Error("Corrupt stored screenshot.");
    return value;
  }

  async listScreenshotsBySession(sessionId: string): Promise<readonly ScreenshotRecord[]> {
    const values = await this.getByIndex<unknown>("screenshots", "sessionId", sessionId);
    if (!values.every(isScreenshotRecord)) throw new Error("Corrupt stored screenshot list.");
    return values;
  }

  async getSessionResourceUsage(
    sessionId: string,
    knownEvidence?: {
      readonly snapshots: readonly RuntimeSnapshot[];
      readonly screenshots: readonly ScreenshotRecord[];
    },
  ): Promise<SessionResourceUsage> {
    const existing = await this.get<unknown>("metadata", sessionResourceUsageKey(sessionId));
    if (existing !== undefined) {
      const record = normalizeSessionResourceUsageRecord(existing, sessionId);
      return toSessionResourceUsage(record);
    }
    return this.rebuildSessionResourceUsage(
      sessionId,
      knownEvidence?.snapshots,
      knownEvidence?.screenshots,
    );
  }

  async rebuildSessionResourceUsage(
    sessionId: string,
    knownSnapshots?: readonly RuntimeSnapshot[],
    knownScreenshots?: readonly ScreenshotRecord[],
  ): Promise<SessionResourceUsage> {
    const [snapshots, screenshots] =
      knownSnapshots && knownScreenshots
        ? [knownSnapshots, knownScreenshots]
        : await Promise.all([
            this.listSnapshotsBySession(sessionId),
            this.listScreenshotsBySession(sessionId),
          ]);
    const encoder = new TextEncoder();
    const screenshotBySnapshotId = new Map(
      screenshots.map((screenshot) => [screenshot.snapshotId, screenshot] as const),
    );
    const records: SnapshotResourceUsageRecord[] = [];
    let snapshotBytes = 0;
    let screenshotBytes = 0;
    for (const snapshot of snapshots) {
      const currentSnapshotBytes = encoder.encode(canonicalJson(snapshot)).length;
      const currentScreenshotBytes =
        screenshotBySnapshotId.get(snapshot.snapshot_id)?.bytes.byteLength ?? 0;
      snapshotBytes = safeResourceAdd(snapshotBytes, currentSnapshotBytes);
      screenshotBytes = safeResourceAdd(screenshotBytes, currentScreenshotBytes);
      records.push({
        key: snapshotResourceUsageKey(sessionId, snapshot.snapshot_id),
        sessionId,
        snapshotId: snapshot.snapshot_id,
        snapshotBytes: currentSnapshotBytes,
        screenshotBytes: currentScreenshotBytes,
      });
    }
    const usageRecord: SessionResourceUsageRecord = {
      key: sessionResourceUsageKey(sessionId),
      sessionId,
      snapshotBytes,
      screenshotBytes,
      captureCount: snapshots.length,
    };
    const database = await openDatabase();
    const transaction = database.transaction("metadata", "readwrite");
    const store = transaction.objectStore("metadata");
    store.put(usageRecord);
    for (const record of records) store.put(record);
    await transactionComplete(transaction);
    return toSessionResourceUsage(usageRecord);
  }

  async putJob(job: CaptureJob): Promise<void> {
    if (!isCaptureJob(job)) throw new Error("Invalid capture job write.");
    await this.put("jobs", job);
  }

  async getJob(id: string): Promise<CaptureJob | undefined> {
    const value = await this.get<unknown>("jobs", id);
    if (value === undefined) return undefined;
    return normalizeStoredJob(value);
  }

  async listJobs(): Promise<readonly CaptureJob[]> {
    return (await this.getAll<unknown>("jobs")).map(normalizeStoredJob);
  }

  async listActiveJobs(): Promise<readonly CaptureJob[]> {
    const groups = await Promise.all(
      [...ACTIVE_CAPTURE_STATUSES].map((status) =>
        this.getByIndex<unknown>("jobs", "status", status),
      ),
    );
    return groups.flat().map(normalizeStoredJob);
  }

  async listJobsByTab(tabId: number): Promise<readonly CaptureJob[]> {
    return (await this.getByIndex<unknown>("jobs", "tabId", tabId)).map(normalizeStoredJob);
  }

  async listJobsBySession(sessionId: string): Promise<readonly CaptureJob[]> {
    return (await this.getByIndex<unknown>("jobs", "sessionId", sessionId)).map(normalizeStoredJob);
  }

  async beginCapture(job: CaptureJob, session: CaptureSession): Promise<void> {
    if (!isCaptureJob(job) || !isCaptureSession(session))
      throw new Error("Invalid capture transaction write.");
    if (job.sessionId !== session.data.session_id || job.config.sessionId !== job.sessionId)
      throw new Error("Capture transaction identity mismatch.");
    const database = await openDatabase();
    const transaction = database.transaction(["jobs", "sessions"], "readwrite");
    const jobStore = transaction.objectStore("jobs");
    const sessionStore = transaction.objectStore("sessions");
    const [storedSession, storedTabJobs, storedSessionJobs] = await Promise.all([
      requestResult<unknown>(sessionStore.get(job.sessionId)),
      requestResult<unknown[]>(jobStore.index("tabId").getAll(job.tabId)),
      requestResult<unknown[]>(jobStore.index("sessionId").getAll(job.sessionId)),
    ]);
    const currentSession =
      storedSession === undefined ? session : normalizeStoredSession(storedSession);
    if (currentSession.data.session_id !== job.sessionId) {
      transaction.abort();
      throw new Error("Capture session identity mismatch.");
    }
    const blockingTabJob = storedTabJobs
      .map(normalizeStoredJob)
      .find(
        (storedJob) => storedJob.id !== job.id && ACTIVE_CAPTURE_STATUSES.has(storedJob.status),
      );
    if (blockingTabJob) {
      transaction.abort();
      throw new Error("A capture is already active for this tab.");
    }
    const blockingSessionJob = storedSessionJobs
      .map(normalizeStoredJob)
      .find(
        (storedJob) => storedJob.id !== job.id && ACTIVE_CAPTURE_STATUSES.has(storedJob.status),
      );
    if (blockingSessionJob) {
      transaction.abort();
      throw new Error("A capture is already active for this session.");
    }
    if (currentSession.data.captures.length !== job.config.observationIndex) {
      transaction.abort();
      throw new Error("Observation index was reserved by a concurrent capture.");
    }
    jobStore.put(job);
    sessionStore.put({
      ...currentSession,
      data: { ...currentSession.data, status: "CAPTURING" },
    } satisfies CaptureSession);
    await transactionComplete(transaction);
  }

  async putChunk(jobId: string, index: number, data: string): Promise<void> {
    const bytes = new TextEncoder().encode(data);
    await this.putChunkRecord({
      key: chunkKey(jobId, index),
      jobId,
      index,
      data,
      sha256: await sha256Hex(bytes),
      byteLength: bytes.length,
      integrityStatus: "VERIFIED",
    });
  }

  async commitChunk(
    job: CaptureJob,
    record: ChunkRecord,
    maximumBytes: number,
  ): Promise<CaptureJob> {
    if (!isCaptureJob(job) || !isChunkRecord(record))
      throw new Error("Invalid chunk transaction write.");
    if (record.jobId !== job.id) throw new Error("Chunk belongs to a different capture job.");
    const database = await openDatabase();
    const transaction = database.transaction(["chunks", "jobs", "metadata"], "readwrite");
    const chunkStore = transaction.objectStore("chunks");
    const jobStore = transaction.objectStore("jobs");
    const metadataStore = transaction.objectStore("metadata");
    const [existingChunk, storedJob, storedAggregate] = await Promise.all([
      requestResult<ChunkRecord | undefined>(chunkStore.get(record.key)),
      requestResult<unknown>(jobStore.get(job.id)),
      requestResult<ChunkAggregateRecord | undefined>(metadataStore.get(chunkAggregateKey(job.id))),
    ]);
    if (storedJob === undefined) {
      transaction.abort();
      throw new Error("Chunk target capture job does not exist.");
    }
    const currentJob = normalizeStoredJob(storedJob);
    if (!ACTIVE_CAPTURE_STATUSES.has(currentJob.status)) {
      transaction.abort();
      throw new Error("Chunk target capture job is no longer active.");
    }
    if (
      existingChunk &&
      (existingChunk.data !== record.data ||
        existingChunk.sha256 !== record.sha256 ||
        existingChunk.byteLength !== record.byteLength)
    ) {
      transaction.abort();
      throw new Error("Conflicting duplicate chunk.");
    }

    let aggregate: ChunkAggregateRecord;
    if (storedAggregate === undefined) {
      const records = await requestResult<ChunkRecord[]>(chunkStore.index("jobId").getAll(job.id));
      const bytes = records.reduce((total, item) => total + item.byteLength, 0);
      aggregate = {
        key: chunkAggregateKey(job.id),
        jobId: job.id,
        count: records.length,
        bytes,
      };
    } else if (isChunkAggregateRecord(storedAggregate) && storedAggregate.jobId === job.id) {
      aggregate = storedAggregate;
    } else {
      transaction.abort();
      throw new Error("Corrupt chunk aggregate metadata.");
    }

    const nextCount = aggregate.count + (existingChunk ? 0 : 1);
    const nextBytes = aggregate.bytes + (existingChunk ? 0 : record.byteLength);
    if (
      !Number.isSafeInteger(nextCount) ||
      nextCount <= 0 ||
      nextCount > 10_000 ||
      !Number.isSafeInteger(nextBytes) ||
      nextBytes < 0 ||
      nextBytes > maximumBytes
    ) {
      transaction.abort();
      throw new Error("Buffered capture chunks exceeded the configured snapshot size limit.");
    }

    if (!existingChunk) chunkStore.put(record);
    metadataStore.put({
      key: chunkAggregateKey(job.id),
      jobId: job.id,
      count: nextCount,
      bytes: nextBytes,
    } satisfies ChunkAggregateRecord);
    const updated: CaptureJob = {
      ...currentJob,
      status: "RECEIVING",
      expectedChunks: job.expectedChunks,
      receivedChunks: nextCount,
      updatedAt: job.updatedAt,
    };
    jobStore.put(updated);
    await transactionComplete(transaction);
    return updated;
  }

  async listChunks(jobId: string): Promise<readonly ChunkRecord[]> {
    const records = await this.getByIndex<unknown>("chunks", "jobId", jobId);
    return records.map(normalizeStoredChunk).sort((a, b) => a.index - b.index);
  }

  async getChunkAggregate(jobId: string): Promise<ChunkAggregateRecord | undefined> {
    const value = await this.get<unknown>("metadata", chunkAggregateKey(jobId));
    if (value === undefined) return undefined;
    if (!isChunkAggregateRecord(value) || value.jobId !== jobId)
      throw new Error("Corrupt chunk aggregate metadata.");
    return value;
  }

  async clearChunks(jobId: string): Promise<void> {
    const records = await this.listChunks(jobId);
    const database = await openDatabase();
    const transaction = database.transaction(["chunks", "metadata"], "readwrite");
    const chunkStore = transaction.objectStore("chunks");
    for (const record of records) chunkStore.delete(record.key);
    transaction.objectStore("metadata").delete(chunkAggregateKey(jobId));
    await transactionComplete(transaction);
  }

  async commitCapture(
    snapshot: RuntimeSnapshot,
    screenshot: ScreenshotRecord | null,
    session: CaptureSession,
    job: CaptureJob,
    chunkKeys: readonly string[],
    claimOwner: string,
    snapshotByteLength?: number,
  ): Promise<void> {
    if (
      !isRuntimeSnapshot(snapshot) ||
      !isCaptureSession(session) ||
      !isCaptureJob(job) ||
      (screenshot !== null && !isScreenshotRecord(screenshot))
    )
      throw new Error("Invalid capture finalization write.");
    if (
      snapshot.session_id !== session.data.session_id ||
      job.sessionId !== session.data.session_id ||
      job.snapshotId !== snapshot.snapshot_id ||
      (screenshot &&
        (screenshot.sessionId !== session.data.session_id ||
          screenshot.snapshotId !== snapshot.snapshot_id))
    )
      throw new Error("Capture transaction identity mismatch.");
    const resolvedSnapshotByteLength =
      snapshotByteLength ?? new TextEncoder().encode(canonicalJson(snapshot)).length;
    if (!Number.isSafeInteger(resolvedSnapshotByteLength) || resolvedSnapshotByteLength <= 0)
      throw new Error("Invalid snapshot resource size.");
    if ((await this.get<unknown>("metadata", sessionResourceUsageKey(job.sessionId))) === undefined)
      await this.rebuildSessionResourceUsage(job.sessionId);
    const database = await openDatabase();
    if (!claimOwner) throw new Error("Capture finalization claim owner is required.");
    const transaction = database.transaction(
      ["sessions", "snapshots", "screenshots", "jobs", "chunks", "metadata"],
      "readwrite",
    );
    const jobStore = transaction.objectStore("jobs");
    const metadataStore = transaction.objectStore("metadata");
    const sessionStore = transaction.objectStore("sessions");
    const [storedJob, storedClaim, storedSession, storedUsage, storedSnapshotUsage] =
      await Promise.all([
        requestResult<unknown>(jobStore.get(job.id)),
        requestResult<FinalizationClaimRecord | undefined>(
          metadataStore.get(finalizationClaimKey(job.id)),
        ),
        requestResult<unknown>(sessionStore.get(job.sessionId)),
        requestResult<unknown>(metadataStore.get(sessionResourceUsageKey(job.sessionId))),
        requestResult<unknown>(
          metadataStore.get(snapshotResourceUsageKey(job.sessionId, snapshot.snapshot_id)),
        ),
      ]);
    if (storedJob === undefined) {
      transaction.abort();
      throw new Error("Capture finalization job disappeared.");
    }
    const currentJob = normalizeStoredJob(storedJob);
    if (
      currentJob.status !== "ASSEMBLING" ||
      currentJob.sessionId !== job.sessionId ||
      currentJob.snapshotId !== job.snapshotId ||
      !storedClaim ||
      !isFinalizationClaimRecord(storedClaim) ||
      storedClaim.owner !== claimOwner
    ) {
      transaction.abort();
      throw new FinalizationClaimLostError();
    }
    if (storedSession === undefined) {
      transaction.abort();
      throw new Error("Capture finalization session disappeared.");
    }
    const currentSession = normalizeStoredSession(storedSession);
    const summary = session.data.captures.find((item) => item.snapshot_id === snapshot.snapshot_id);
    if (!summary) {
      transaction.abort();
      throw new Error("Capture finalization summary is missing.");
    }
    const mergedSession = mergeCommittedSession(currentSession, session, summary, snapshot);
    const currentUsage =
      storedUsage === undefined
        ? emptySessionResourceUsageRecord(job.sessionId)
        : normalizeSessionResourceUsageRecord(storedUsage, job.sessionId);
    const previousSnapshotUsage =
      storedSnapshotUsage === undefined
        ? null
        : normalizeSnapshotResourceUsageRecord(
            storedSnapshotUsage,
            job.sessionId,
            snapshot.snapshot_id,
          );
    const nextSnapshotUsage: SnapshotResourceUsageRecord = {
      key: snapshotResourceUsageKey(job.sessionId, snapshot.snapshot_id),
      sessionId: job.sessionId,
      snapshotId: snapshot.snapshot_id,
      snapshotBytes: resolvedSnapshotByteLength,
      screenshotBytes: screenshot?.bytes.byteLength ?? 0,
    };
    const nextUsage: SessionResourceUsageRecord = {
      key: sessionResourceUsageKey(job.sessionId),
      sessionId: job.sessionId,
      snapshotBytes: safeResourceAdd(
        currentUsage.snapshotBytes - (previousSnapshotUsage?.snapshotBytes ?? 0),
        nextSnapshotUsage.snapshotBytes,
      ),
      screenshotBytes: safeResourceAdd(
        currentUsage.screenshotBytes - (previousSnapshotUsage?.screenshotBytes ?? 0),
        nextSnapshotUsage.screenshotBytes,
      ),
      captureCount: currentUsage.captureCount + (previousSnapshotUsage ? 0 : 1),
    };
    transaction.objectStore("snapshots").put(snapshot);
    if (screenshot) transaction.objectStore("screenshots").put(screenshot);
    sessionStore.put(mergedSession);
    jobStore.put(job);
    const chunkStore = transaction.objectStore("chunks");
    for (const key of chunkKeys) chunkStore.delete(key);
    metadataStore.delete(finalizationClaimKey(job.id));
    metadataStore.delete(chunkAggregateKey(job.id));
    metadataStore.put(nextSnapshotUsage);
    metadataStore.put(nextUsage);
    await transactionComplete(transaction);
  }

  async terminateCapture(
    job: CaptureJob,
    session: CaptureSession | null,
    chunkKeys: readonly string[],
  ): Promise<boolean> {
    if (!isCaptureJob(job) || (session !== null && !isCaptureSession(session)))
      throw new Error("Invalid capture termination write.");
    const database = await openDatabase();
    const transaction = database.transaction(
      ["jobs", "sessions", "chunks", "metadata"],
      "readwrite",
    );
    const jobStore = transaction.objectStore("jobs");
    const stored = await requestResult<unknown>(jobStore.get(job.id));
    if (stored === undefined) {
      transaction.abort();
      throw new Error("Capture termination target does not exist.");
    }
    const current = normalizeStoredJob(stored);
    if (!ACTIVE_CAPTURE_STATUSES.has(current.status)) {
      await transactionComplete(transaction);
      return false;
    }
    jobStore.put(job);
    if (session) transaction.objectStore("sessions").put(session);
    const chunkStore = transaction.objectStore("chunks");
    for (const key of chunkKeys) chunkStore.delete(key);
    const metadataStore = transaction.objectStore("metadata");
    metadataStore.delete(finalizationClaimKey(job.id));
    metadataStore.delete(chunkAggregateKey(job.id));
    await transactionComplete(transaction);
    return true;
  }

  async deleteSessionArtifacts(sessionId: string): Promise<void> {
    const [snapshots, jobs] = await Promise.all([
      this.listSnapshotsBySession(sessionId),
      this.listJobsBySession(sessionId),
    ]);
    const chunkKeys = (await Promise.all(jobs.map(async (job) => this.listChunks(job.id)))).flatMap(
      (records) => records.map((record) => record.key),
    );
    const database = await openDatabase();
    const transaction = database.transaction(
      ["sessions", "snapshots", "screenshots", "jobs", "chunks", "metadata"],
      "readwrite",
    );
    transaction.objectStore("sessions").delete(sessionId);
    for (const snapshot of snapshots) {
      transaction.objectStore("snapshots").delete(snapshot.snapshot_id);
      transaction.objectStore("screenshots").delete(snapshot.snapshot_id);
      transaction
        .objectStore("metadata")
        .delete(snapshotResourceUsageKey(sessionId, snapshot.snapshot_id));
    }
    for (const job of jobs) {
      transaction.objectStore("jobs").delete(job.id);
      transaction.objectStore("metadata").delete(finalizationClaimKey(job.id));
      transaction.objectStore("metadata").delete(chunkAggregateKey(job.id));
    }
    for (const key of chunkKeys) transaction.objectStore("chunks").delete(key);
    transaction.objectStore("metadata").delete(sessionResourceUsageKey(sessionId));
    await transactionComplete(transaction);
  }

  async clearAll(): Promise<void> {
    const database = await openDatabase();
    const names: StoreName[] = [
      "sessions",
      "snapshots",
      "screenshots",
      "jobs",
      "chunks",
      "metadata",
    ];
    const transaction = database.transaction(names, "readwrite");
    for (const name of names.filter((item) => item !== "metadata"))
      transaction.objectStore(name).clear();
    const metadata = transaction.objectStore("metadata");
    const keys = await requestResult<IDBValidKey[]>(metadata.getAllKeys());
    for (const key of keys)
      if (typeof key !== "string" || !key.startsWith("sequence:")) metadata.delete(key);
    await transactionComplete(transaction);
  }

  async maintainInternalStateIfDue(
    nowMs = Date.now(),
    intervalMs = STORAGE_MAINTENANCE_INTERVAL_MS,
  ): Promise<StorageMaintenanceResult | null> {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid maintenance clock.");
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 0)
      throw new Error("Invalid maintenance interval.");
    const last = await this.get<unknown>("metadata", LAST_MAINTENANCE_KEY);
    if (isMetadataRecord(last) && nowMs - last.value < intervalMs) return null;
    const result = await this.maintainInternalState(nowMs);
    await this.put("metadata", {
      key: LAST_MAINTENANCE_KEY,
      value: nowMs,
    } satisfies MetadataRecord);
    return result;
  }

  async maintainInternalState(
    nowMs = Date.now(),
    terminalJobRetentionMs = DEFAULT_TERMINAL_JOB_RETENTION_MS,
  ): Promise<StorageMaintenanceResult> {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Invalid maintenance clock.");
    if (
      !Number.isSafeInteger(terminalJobRetentionMs) ||
      terminalJobRetentionMs < 0 ||
      terminalJobRetentionMs > 365 * 24 * 60 * 60 * 1_000
    )
      throw new Error("Invalid terminal job retention window.");

    const database = await openDatabase();
    const jobs: CaptureJob[] = [];
    const activeJobIds = new Set<string>();
    {
      const transaction = database.transaction("jobs", "readonly");
      await iterateCursor(transaction.objectStore("jobs").openCursor(), (cursor) => {
        const job = normalizeStoredJob(cursor.value);
        jobs.push(job);
        if (ACTIVE_CAPTURE_STATUSES.has(job.status)) activeJobIds.add(job.id);
      });
      await transactionComplete(transaction);
    }

    const transaction = database.transaction(["jobs", "chunks", "metadata"], "readwrite");
    const jobStore = transaction.objectStore("jobs");
    const chunkStore = transaction.objectStore("chunks");
    const metadataStore = transaction.objectStore("metadata");
    const chunkTotals = new Map<string, { count: number; bytes: number }>();
    const aggregateByJob = new Map<string, ChunkAggregateRecord>();
    let expiredClaimsRemoved = 0;
    let orphanedChunksRemoved = 0;
    let chunkAggregatesRebuilt = 0;
    let terminalJobsRemoved = 0;

    await scanMaintenanceStores(
      chunkStore,
      metadataStore,
      (cursor) => {
        const chunk = normalizeStoredChunk(cursor.value);
        if (!activeJobIds.has(chunk.jobId)) {
          cursor.delete();
          orphanedChunksRemoved += 1;
          return;
        }
        const current = chunkTotals.get(chunk.jobId) ?? { count: 0, bytes: 0 };
        const count = current.count + 1;
        const bytes = current.bytes + chunk.byteLength;
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(bytes) || bytes < 0) {
          transaction.abort();
          throw new Error("Stored chunk aggregate is invalid.");
        }
        chunkTotals.set(chunk.jobId, { count, bytes });
      },
      (cursor) => {
        const record: unknown = cursor.value;
        if (isFinalizationClaimRecord(record)) {
          const jobId = record.key.slice("finalization:".length);
          if (!activeJobIds.has(jobId) || record.expiresAt <= nowMs) {
            cursor.delete();
            expiredClaimsRemoved += 1;
          }
          return;
        }
        if (isChunkAggregateRecord(record)) {
          aggregateByJob.set(record.jobId, record);
          if (!activeJobIds.has(record.jobId)) cursor.delete();
        }
      },
      () => {
        for (const jobId of activeJobIds) {
          const totals = chunkTotals.get(jobId) ?? { count: 0, bytes: 0 };
          const current = aggregateByJob.get(jobId);
          if (!current || current.count !== totals.count || current.bytes !== totals.bytes) {
            metadataStore.put({
              key: chunkAggregateKey(jobId),
              jobId,
              count: totals.count,
              bytes: totals.bytes,
            } satisfies ChunkAggregateRecord);
            chunkAggregatesRebuilt += 1;
          }
        }

        for (const job of jobs) {
          if (ACTIVE_CAPTURE_STATUSES.has(job.status)) continue;
          const updatedMs = Date.parse(job.updatedAt);
          if (Number.isFinite(updatedMs) && nowMs - updatedMs < terminalJobRetentionMs) continue;
          jobStore.delete(job.id);
          metadataStore.delete(finalizationClaimKey(job.id));
          metadataStore.delete(chunkAggregateKey(job.id));
          terminalJobsRemoved += 1;
        }
      },
    );

    await transactionComplete(transaction);
    return {
      expiredClaimsRemoved,
      orphanedChunksRemoved,
      chunkAggregatesRebuilt,
      terminalJobsRemoved,
    };
  }

  async estimateUsage(): Promise<number> {
    const estimate = await navigator.storage?.estimate();
    return estimate?.usage ?? 0;
  }

  private async putChunkRecord(record: ChunkRecord): Promise<void> {
    const existing = await this.get<ChunkRecord>("chunks", record.key);
    if (existing && existing.data !== record.data) throw new Error("Conflicting duplicate chunk.");
    await this.put("chunks", record);
  }

  private async put(store: StoreName, value: unknown): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).put(value);
    await transactionComplete(transaction);
  }

  private async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const database = await openDatabase();
    const transaction = database.transaction(store, "readonly");
    const value = await requestResult<T | undefined>(transaction.objectStore(store).get(key));
    await transactionComplete(transaction);
    return value;
  }

  private async getAll<T>(store: StoreName): Promise<readonly T[]> {
    const database = await openDatabase();
    const transaction = database.transaction(store, "readonly");
    const value = await requestResult<T[]>(transaction.objectStore(store).getAll());
    await transactionComplete(transaction);
    return value;
  }

  private async getByIndex<T>(
    store: StoreName,
    index: string,
    key: IDBValidKey,
  ): Promise<readonly T[]> {
    const database = await openDatabase();
    const transaction = database.transaction(store, "readonly");
    const value = await requestResult<T[]>(transaction.objectStore(store).index(index).getAll(key));
    await transactionComplete(transaction);
    return value;
  }

  private async deleteKeys(store: StoreName, keys: readonly IDBValidKey[]): Promise<void> {
    if (keys.length === 0) return;
    const database = await openDatabase();
    const transaction = database.transaction(store, "readwrite");
    for (const key of keys) transaction.objectStore(store).delete(key);
    await transactionComplete(transaction);
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function iterateCursor(
  request: IDBRequest<IDBCursorWithValue | null>,
  visit: (cursor: IDBCursorWithValue) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      try {
        visit(cursor);
        cursor.continue();
      } catch (error: unknown) {
        reject(asError(error));
      }
    };
  });
}

function scanMaintenanceStores(
  chunkStore: IDBObjectStore,
  metadataStore: IDBObjectStore,
  visitChunk: (cursor: IDBCursorWithValue) => void,
  visitMetadata: (cursor: IDBCursorWithValue) => void,
  finalize: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = 0;
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(asError(error));
    };
    const complete = (): void => {
      if (settled) return;
      completed += 1;
      if (completed !== 2) return;
      try {
        finalize();
        settled = true;
        resolve();
      } catch (error: unknown) {
        fail(error);
      }
    };
    const attach = (
      request: IDBRequest<IDBCursorWithValue | null>,
      visit: (cursor: IDBCursorWithValue) => void,
    ): void => {
      request.onerror = () => fail(request.error ?? new Error("IndexedDB cursor failed."));
      request.onsuccess = () => {
        if (settled) return;
        const cursor = request.result;
        if (!cursor) {
          complete();
          return;
        }
        try {
          visit(cursor);
          cursor.continue();
        } catch (error: unknown) {
          fail(error);
        }
      };
    };
    attach(chunkStore.openCursor(), visitChunk);
    attach(metadataStore.openCursor(), visitMetadata);
  });
}

type StoreName = "sessions" | "snapshots" | "screenshots" | "jobs" | "chunks" | "metadata";
let databasePromise: Promise<IDBDatabase> | undefined;

function finalizationClaimKey(jobId: string): string {
  return `finalization:${jobId}`;
}

function chunkAggregateKey(jobId: string): string {
  return `chunk-aggregate:${jobId}`;
}

function validateFinalizationClaimInput(
  jobId: string,
  owner: string,
  nowMs: number,
  leaseMs: number,
): void {
  if (!jobId || !owner || !Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("Invalid finalization claim identity.");
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 120_000)
    throw new Error("Invalid finalization claim lease.");
}

function isFinalizationClaimRecord(value: unknown): value is FinalizationClaimRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    record.key.startsWith("finalization:") &&
    typeof record.owner === "string" &&
    record.owner.length > 0 &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt >= 0
  );
}

function isChunkAggregateRecord(value: unknown): value is ChunkAggregateRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    record.key.startsWith("chunk-aggregate:") &&
    typeof record.jobId === "string" &&
    record.key === chunkAggregateKey(record.jobId) &&
    typeof record.count === "number" &&
    Number.isSafeInteger(record.count) &&
    record.count >= 0 &&
    record.count <= 10_000 &&
    typeof record.bytes === "number" &&
    Number.isSafeInteger(record.bytes) &&
    record.bytes >= 0
  );
}

function isMetadataRecord(value: unknown): value is MetadataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    typeof record.value === "number" &&
    Number.isSafeInteger(record.value) &&
    record.value >= 0
  );
}

function sessionResourceUsageKey(sessionId: string): string {
  return `session-resource:${sessionId}`;
}

function snapshotResourceUsageKey(sessionId: string, snapshotId: string): string {
  return `snapshot-resource:${sessionId}:${snapshotId}`;
}

function emptySessionResourceUsageRecord(sessionId: string): SessionResourceUsageRecord {
  return {
    key: sessionResourceUsageKey(sessionId),
    sessionId,
    snapshotBytes: 0,
    screenshotBytes: 0,
    captureCount: 0,
  };
}

function normalizeSessionResourceUsageRecord(
  value: unknown,
  sessionId: string,
): SessionResourceUsageRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Corrupt session resource metadata.");
  const record = value as Record<string, unknown>;
  if (
    record.key !== sessionResourceUsageKey(sessionId) ||
    record.sessionId !== sessionId ||
    !isNonNegativeSafeInteger(record.snapshotBytes) ||
    !isNonNegativeSafeInteger(record.screenshotBytes) ||
    !isNonNegativeSafeInteger(record.captureCount) ||
    record.captureCount > 1_000
  )
    throw new Error("Corrupt session resource metadata.");
  return record as unknown as SessionResourceUsageRecord;
}

function normalizeSnapshotResourceUsageRecord(
  value: unknown,
  sessionId: string,
  snapshotId: string,
): SnapshotResourceUsageRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Corrupt snapshot resource metadata.");
  const record = value as Record<string, unknown>;
  if (
    record.key !== snapshotResourceUsageKey(sessionId, snapshotId) ||
    record.sessionId !== sessionId ||
    record.snapshotId !== snapshotId ||
    !isNonNegativeSafeInteger(record.snapshotBytes) ||
    !isNonNegativeSafeInteger(record.screenshotBytes)
  )
    throw new Error("Corrupt snapshot resource metadata.");
  return record as unknown as SnapshotResourceUsageRecord;
}

function toSessionResourceUsage(record: SessionResourceUsageRecord): SessionResourceUsage {
  return {
    snapshotBytes: record.snapshotBytes,
    screenshotBytes: record.screenshotBytes,
    totalBytes: safeResourceAdd(record.snapshotBytes, record.screenshotBytes),
    captureCount: record.captureCount,
  };
}

function safeResourceAdd(left: number, right: number): number {
  if (!isNonNegativeSafeInteger(left) || !isNonNegativeSafeInteger(right))
    throw new Error("Resource byte accounting is invalid.");
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw new Error("Resource byte accounting overflowed.");
  return total;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function indexedDbKeyToDiagnosticString(value: IDBValidKey): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(indexedDbKeyToDiagnosticString).join(":");
  return "unknown";
}

function chunkKey(jobId: string, index: number): string {
  return `${jobId}:${index.toString().padStart(6, "0")}`;
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("IndexedDB migration is blocked."));
    };
    request.onupgradeneeded = (event) =>
      migrateIndexedDbSchema(request.result, request.transaction, event.oldVersion);
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
  });
  return databasePromise;
}

export function migrateIndexedDbSchema(
  database: IDBDatabase,
  transaction: IDBTransaction | null,
  oldVersion: number,
): void {
  if (!transaction) throw new Error("IndexedDB migration transaction is unavailable.");
  if (!database.objectStoreNames.contains("sessions"))
    database.createObjectStore("sessions", { keyPath: "data.session_id" });

  if (oldVersion < 2 && database.objectStoreNames.contains("snapshots"))
    database.deleteObjectStore("snapshots");
  if (!database.objectStoreNames.contains("snapshots")) {
    const store = database.createObjectStore("snapshots", { keyPath: "snapshot_id" });
    store.createIndex("sessionId", "session_id", { unique: false });
  }

  let screenshots: IDBObjectStore;
  if (!database.objectStoreNames.contains("screenshots")) {
    screenshots = database.createObjectStore("screenshots", { keyPath: "snapshotId" });
  } else {
    screenshots = transaction.objectStore("screenshots");
  }
  if (!screenshots.indexNames.contains("sessionId"))
    screenshots.createIndex("sessionId", "sessionId", { unique: false });
  let jobs: IDBObjectStore;
  if (!database.objectStoreNames.contains("jobs")) {
    jobs = database.createObjectStore("jobs", { keyPath: "id" });
    jobs.createIndex("tabId", "tabId", { unique: false });
  } else {
    jobs = transaction.objectStore("jobs");
  }
  if (!jobs.indexNames.contains("sessionId"))
    jobs.createIndex("sessionId", "sessionId", { unique: false });
  if (!jobs.indexNames.contains("status")) jobs.createIndex("status", "status", { unique: false });

  if (!database.objectStoreNames.contains("chunks")) {
    const store = database.createObjectStore("chunks", { keyPath: "key" });
    store.createIndex("jobId", "jobId", { unique: false });
  }
  if (!database.objectStoreNames.contains("metadata"))
    database.createObjectStore("metadata", { keyPath: "key" });
}

function isChunkRecord(value: ChunkRecord): boolean {
  return (
    typeof value.key === "string" &&
    value.key === chunkKey(value.jobId, value.index) &&
    typeof value.jobId === "string" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    typeof value.data === "string" &&
    value.data.length <= 524_288 &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    value.sha256 !== LEGACY_UNVERIFIED_CHUNK_HASH &&
    (value.integrityStatus === undefined || value.integrityStatus === "VERIFIED") &&
    Number.isInteger(value.byteLength) &&
    value.byteLength > 0 &&
    value.byteLength <= 1_048_576
  );
}

function normalizeStoredSession(value: unknown): CaptureSession {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const data = record.data;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const normalized = {
        ...record,
        schema_version: record.schema_version === "1.0.0" ? "1.1.0" : record.schema_version,
        data: {
          ...(data as Record<string, unknown>),
          workflow_mode: (data as Record<string, unknown>).workflow_mode ?? null,
        },
      };
      if (isCaptureSession(normalized)) return normalized;
    }
  }
  throw new Error("Corrupt stored capture session.");
}

function mergeCommittedSession(
  currentSession: CaptureSession,
  proposedSession: CaptureSession,
  summary: CaptureSummary,
  snapshot: RuntimeSnapshot,
): CaptureSession {
  const captures = [
    ...currentSession.data.captures.filter((item) => item.snapshot_id !== summary.snapshot_id),
    summary,
  ].sort(compareCaptureSummaries);
  return {
    ...currentSession,
    diagnostics: [...currentSession.diagnostics, ...snapshot.diagnostics],
    data: {
      ...currentSession.data,
      status: captures.every((item) => item.status === "COMPLETE") ? "COMPLETE" : "PARTIAL",
      browser_family: snapshot.runtime_environment.browser_family,
      browser_version: snapshot.runtime_environment.browser_version,
      runtime_environment: snapshot.runtime_environment,
      source_context_reference: snapshot.source_context_reference,
      source_binding_state: strongestBindingState(
        currentSession.data.source_binding_state,
        proposedSession.data.source_binding_state,
      ),
      captures,
    },
  };
}

function compareCaptureSummaries(left: CaptureSummary, right: CaptureSummary): number {
  return (
    compareStrings(left.captured_at, right.captured_at) ||
    compareStrings(left.snapshot_id, right.snapshot_id)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strongestBindingState(
  left: SessionSourceBindingState,
  right: SessionSourceBindingState,
): SessionSourceBindingState {
  const rank: Record<SessionSourceBindingState, number> = {
    UNMATCHED: 0,
    AMBIGUOUS: 1,
    PROBABLE: 2,
    EXACT: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

function normalizeStoredJob(value: unknown): CaptureJob {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const config = record.config;
    const normalizedConfig =
      typeof config === "object" && config !== null && !Array.isArray(config)
        ? {
            ...(config as Record<string, unknown>),
            capturedAt: (config as Record<string, unknown>).capturedAt ?? record.createdAt,
            workflowMode: (config as Record<string, unknown>).workflowMode ?? "RUNTIME_EVIDENCE",
            expectedPageFingerprint:
              (config as Record<string, unknown>).expectedPageFingerprint ?? null,
            expectedViewportWidth:
              (config as Record<string, unknown>).expectedViewportWidth ?? null,
          }
        : config;
    const normalized = {
      ...record,
      documentId: record.documentId ?? null,
      config: normalizedConfig,
    };
    if (isCaptureJob(normalized)) return normalized;
  }
  throw new Error("Corrupt stored capture job.");
}

function normalizeStoredChunk(value: unknown): ChunkRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Corrupt stored capture chunk.");
  const record = value as Record<string, unknown>;
  if (
    typeof record.key !== "string" ||
    typeof record.jobId !== "string" ||
    typeof record.index !== "number" ||
    !Number.isInteger(record.index) ||
    record.index < 0 ||
    typeof record.data !== "string"
  )
    throw new Error("Corrupt stored capture chunk.");
  const byteLength =
    typeof record.byteLength === "number" && Number.isInteger(record.byteLength)
      ? record.byteLength
      : new TextEncoder().encode(record.data).length;
  const hasVerifiedHash =
    typeof record.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.sha256) &&
    record.sha256 !== LEGACY_UNVERIFIED_CHUNK_HASH;
  const sha256 = hasVerifiedHash ? String(record.sha256) : LEGACY_UNVERIFIED_CHUNK_HASH;
  const integrityStatus = hasVerifiedHash ? "VERIFIED" : "LEGACY_UNVERIFIED";
  if (byteLength < 0 || byteLength > 1_048_576 || record.data.length > 524_288)
    throw new Error("Corrupt stored capture chunk.");
  return {
    key: record.key,
    jobId: record.jobId,
    index: record.index,
    data: record.data,
    sha256,
    byteLength,
    integrityStatus,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
