import type {
  CaptureJob,
  CaptureSession,
  RuntimeSnapshot,
  ScreenshotRecord,
} from "../../domain/model";

const DB_NAME = "edis-runtime-collector";
const DB_VERSION = 1;

export interface ChunkRecord {
  readonly key: string;
  readonly jobId: string;
  readonly index: number;
  readonly data: string;
}

export class EvidenceRepository {
  async putSession(session: CaptureSession): Promise<void> {
    await this.put("sessions", session);
  }

  async getSession(id: string): Promise<CaptureSession | undefined> {
    return this.get<CaptureSession>("sessions", id);
  }

  async listSessions(): Promise<readonly CaptureSession[]> {
    return this.getAll<CaptureSession>("sessions");
  }

  async putSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
    await this.put("snapshots", snapshot);
  }

  async getSnapshot(id: string): Promise<RuntimeSnapshot | undefined> {
    return this.get<RuntimeSnapshot>("snapshots", id);
  }

  async listSnapshotsBySession(sessionId: string): Promise<readonly RuntimeSnapshot[]> {
    return this.getByIndex<RuntimeSnapshot>("snapshots", "sessionId", sessionId);
  }

  async putScreenshot(record: ScreenshotRecord): Promise<void> {
    await this.put("screenshots", record);
  }

  async getScreenshot(snapshotId: string): Promise<ScreenshotRecord | undefined> {
    return this.get<ScreenshotRecord>("screenshots", snapshotId);
  }

  async putJob(job: CaptureJob): Promise<void> {
    await this.put("jobs", job);
  }

  async getJob(id: string): Promise<CaptureJob | undefined> {
    return this.get<CaptureJob>("jobs", id);
  }

  async listJobs(): Promise<readonly CaptureJob[]> {
    return this.getAll<CaptureJob>("jobs");
  }

  async listJobsByTab(tabId: number): Promise<readonly CaptureJob[]> {
    return this.getByIndex<CaptureJob>("jobs", "tabId", tabId);
  }

  async putChunk(jobId: string, index: number, data: string): Promise<void> {
    await this.put("chunks", {
      key: `${jobId}:${index.toString().padStart(6, "0")}`,
      jobId,
      index,
      data,
    } satisfies ChunkRecord);
  }

  async listChunks(jobId: string): Promise<readonly ChunkRecord[]> {
    const records = await this.getByIndex<ChunkRecord>("chunks", "jobId", jobId);
    return [...records].sort((a, b) => a.index - b.index);
  }

  async clearChunks(jobId: string): Promise<void> {
    const records = await this.listChunks(jobId);
    await this.deleteKeys(
      "chunks",
      records.map((record) => record.key),
    );
  }

  async deleteSessionArtifacts(sessionId: string): Promise<void> {
    const snapshots = await this.listSnapshotsBySession(sessionId);
    const database = await openDatabase();
    const transaction = database.transaction(["sessions", "snapshots", "screenshots"], "readwrite");
    transaction.objectStore("sessions").delete(sessionId);
    for (const snapshot of snapshots) {
      transaction.objectStore("snapshots").delete(snapshot.data.snapshot_id);
      transaction.objectStore("screenshots").delete(snapshot.data.snapshot_id);
    }
    await transactionComplete(transaction);
  }

  async clearAll(): Promise<void> {
    const database = await openDatabase();
    const names = ["sessions", "snapshots", "screenshots", "jobs", "chunks"];
    const transaction = database.transaction(names, "readwrite");
    for (const name of names) transaction.objectStore(name).clear();
    await transactionComplete(transaction);
  }

  async estimateUsage(): Promise<number> {
    const estimate = await navigator.storage?.estimate();
    return estimate?.usage ?? 0;
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

type StoreName = "sessions" | "snapshots" | "screenshots" | "jobs" | "chunks";
let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB migration is blocked."));
    request.onupgradeneeded = () => migrate(request.result, request.transaction);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
  return databasePromise;
}

function migrate(database: IDBDatabase, transaction: IDBTransaction | null): void {
  if (!transaction) throw new Error("IndexedDB migration transaction is unavailable.");
  if (!database.objectStoreNames.contains("sessions"))
    database.createObjectStore("sessions", { keyPath: "data.session_id" });
  if (!database.objectStoreNames.contains("snapshots")) {
    const store = database.createObjectStore("snapshots", { keyPath: "data.snapshot_id" });
    store.createIndex("sessionId", "data.session_id", { unique: false });
  }
  if (!database.objectStoreNames.contains("screenshots"))
    database.createObjectStore("screenshots", { keyPath: "snapshotId" });
  if (!database.objectStoreNames.contains("jobs")) {
    const store = database.createObjectStore("jobs", { keyPath: "id" });
    store.createIndex("tabId", "tabId", { unique: false });
  }
  if (!database.objectStoreNames.contains("chunks")) {
    const store = database.createObjectStore("chunks", { keyPath: "key" });
    store.createIndex("jobId", "jobId", { unique: false });
  }
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
