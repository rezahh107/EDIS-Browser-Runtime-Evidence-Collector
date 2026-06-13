import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import { makeSession, makeSnapshot, sessionId, snapshotId } from "../helpers/fixtures";

describe("IndexedDB buffering", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("stores sessions, snapshots, and ordered chunks", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());
    await repository.putChunk("job", 1, "b");
    await repository.putChunk("job", 0, "a");
    expect((await repository.getSession(sessionId))?.data.session_id).toBe(sessionId);
    expect((await repository.getSnapshot(snapshotId))?.data.snapshot_id).toBe(snapshotId);
    expect((await repository.listChunks("job")).map((chunk) => chunk.data)).toEqual(["a", "b"]);
  });
});
