import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CaptureCoordinator } from "../../src/background/captureCoordinator";
import { DEFAULT_PREFERENCES, type CaptureJob } from "../../src/domain/model";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";

beforeAll(() => {
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-id", getManifest: () => ({ version: "1.6.4" }) },
    storage: { session: { remove: vi.fn(async () => undefined) } },
  });
});

describe("worker restart recovery", () => {
  it("marks stale persisted jobs explicitly interrupted", async () => {
    const repository = new EvidenceRepository();
    await repository.clearAll();
    const job: CaptureJob = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      requestId: "423e4567-e89b-12d3-a456-426614174000",
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      snapshotId: "223e4567-e89b-12d3-a456-426614174000",
      tabId: 1,
      windowId: 1,
      documentUrl: "https://example.test/",
      documentId: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      status: "RECEIVING",
      expectedChunks: 2,
      receivedChunks: 1,
      config: {
        ...DEFAULT_PREFERENCES,
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        snapshotId: "223e4567-e89b-12d3-a456-426614174000",
        observationIndex: 0,
        userLabel: "Test",
        evidenceLabel: "SIMULATED_VIEWPORT",
        requestedProfileId: "CUSTOM",
        workflowMode: "RUNTIME_EVIDENCE",
        expectedPageFingerprint: null,
        expectedViewportWidth: null,
        capturedAt: "2020-01-01T00:00:00.000Z",
        bindingContext: null,
      },
      diagnostics: [],
    };
    await repository.putJob(job);
    await new CaptureCoordinator().recoverInterruptedJobs();
    expect((await repository.getJob(job.id))?.status).toBe("INTERRUPTED");
  });
});
