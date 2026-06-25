import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { CaptureCoordinator } from "../../src/background/captureCoordinator";
import { isCapturableUrl } from "../../src/infrastructure/browser/browserAdapter";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import {
  capturedAt,
  makeCaptureConfiguration,
  makeSession,
  sessionId,
  snapshotId,
} from "../helpers/fixtures";
import type { CaptureJob } from "../../src/domain/model";

describe("document binding, navigation, and restricted page boundaries", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("binds a missing documentId once and rejects stale chunks from a different document", async () => {
    const repository = new EvidenceRepository();
    await repository.putJob(makeJob(null, "https://example.test/"));
    const coordinator = new CaptureCoordinator();

    const configuration = await coordinator.configurationForTab(
      7,
      "https://example.test/",
      "https://example.test/",
      "document-a",
    );
    expect(configuration?.jobId).toBe("423e4567-e89b-42d3-a456-426614174000");
    expect((await repository.getJob("423e4567-e89b-42d3-a456-426614174000"))?.documentId).toBe(
      "document-a",
    );

    await expect(
      coordinator.acceptChunk(7, "https://example.test/", "document-b", {
        jobId: "423e4567-e89b-42d3-a456-426614174000",
        index: 0,
        total: 1,
        data: "{}",
        sha256: "0".repeat(64),
        byteLength: 2,
      }),
    ).rejects.toThrow(/active capture job not found/i);
  });

  it("rejects same-tab same-url claimed/sender mismatches and navigation during capture", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession({
      ...makeSession(),
      data: { ...makeSession().data, captures: [], status: "CAPTURING" },
    });
    await repository.putJob(makeJob(null, "https://example.test/a"));
    const coordinator = new CaptureCoordinator();

    await expect(
      coordinator.configurationForTab(7, "https://example.test/a", "https://example.test/b", null),
    ).resolves.toBeNull();

    await coordinator.handleNavigation(7);
    expect((await repository.getJob("423e4567-e89b-42d3-a456-426614174000"))?.status).toBe(
      "NAVIGATED",
    );
    expect((await repository.getSession(sessionId))?.diagnostics.at(-1)).toMatchObject({
      code: "EDIS_RUNTIME_TAB_NAVIGATED",
    });
  });

  it.each([
    ["normal https page", "https://example.test/page", true, null],
    ["normal http page", "http://example.test/page", true, null],
    [
      "PDF/browser-handled extensionless file",
      "file:///tmp/example.pdf",
      false,
      "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    ],
    ["Chrome UI page", "chrome://extensions/", false, "EDIS_RUNTIME_UNSUPPORTED_PAGE"],
    ["Edge UI page", "edge://extensions/", false, "EDIS_RUNTIME_UNSUPPORTED_PAGE"],
    [
      "Chrome extension page",
      "chrome-extension://abc/popup.html",
      false,
      "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    ],
    [
      "Edge extension page",
      "edge-extension://abc/popup.html",
      false,
      "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    ],
    [
      "Chrome Web Store",
      "https://chromewebstore.google.com/detail/test",
      false,
      "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    ],
    [
      "Edge Add-ons",
      "https://microsoftedge.microsoft.com/addons/detail/test",
      false,
      "EDIS_RUNTIME_UNSUPPORTED_PAGE",
    ],
  ] as const)("classifies %s injection eligibility", (_label, url, allowed, code) => {
    const result = isCapturableUrl(url);
    expect(result.ok).toBe(allowed);
    if (!allowed) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
        expect(result.error.failure_boundary).toBe(
          "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
        );
      }
    }
  });
});

function makeJob(documentId: string | null, documentUrl: string): CaptureJob {
  return {
    id: "423e4567-e89b-42d3-a456-426614174000",
    requestId: "523e4567-e89b-42d3-a456-426614174000",
    sessionId,
    snapshotId,
    tabId: 7,
    windowId: 3,
    documentUrl,
    documentId,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    status: "INJECTED",
    expectedChunks: null,
    receivedChunks: 0,
    config: makeCaptureConfiguration(),
    diagnostics: [],
  };
}
