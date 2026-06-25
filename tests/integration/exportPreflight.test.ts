import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getExportPreflight } from "../../src/application/exportUseCase";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import { makeSession, makeSnapshot, sessionId } from "../helpers/fixtures";

describe("export preflight", () => {
  beforeEach(async () => {
    await new EvidenceRepository().clearAll();
  });

  it("reports evidence gaps without converting them into factual conclusions", async () => {
    const repository = new EvidenceRepository();
    await repository.putSession(makeSession());
    await repository.putSnapshot(makeSnapshot());

    const report = await getExportPreflight(sessionId);
    expect(report.observations).toBe(1);
    expect(report.runtimeNodes).toBe(0);
    expect(report.sourceContextImported).toBe(false);
    expect(report.distinctViewports).toBe(1);
    expect(report.blockingErrors).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        "SOURCE_CONTEXT_NOT_IMPORTED",
        "SINGLE_VIEWPORT_ONLY",
        "SCREENSHOT_NOT_REQUESTED",
        "HIDDEN_ELEMENTS_EXCLUDED",
      ]),
    );
  });

  it("keeps minimum-feed blockers while exposing a safe runtime-evidence fallback", async () => {
    const repository = new EvidenceRepository();
    const session = makeSession();
    await repository.putSession({
      ...session,
      data: { ...session.data, workflow_mode: "MINIMUM_PYTHON_FEED" },
    });
    await repository.putSnapshot(makeSnapshot());

    const minimumReport = await getExportPreflight(sessionId, "MINIMUM_PYTHON_FEED");
    expect(minimumReport.blockingErrors).toEqual(
      expect.arrayContaining([
        "EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED",
        "EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS",
        "EDIS_RUNTIME_INSUFFICIENT_DISTINCT_VIEWPORTS",
        "EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING",
      ]),
    );
    expect(minimumReport.runtimeEvidenceFallbackAvailable).toBe(true);

    const runtimeReport = await getExportPreflight(sessionId, "RUNTIME_EVIDENCE");
    expect(runtimeReport.blockingErrors).toEqual([]);
    expect(runtimeReport.runtimeEvidenceFallbackAvailable).toBe(false);
  });
  it("keeps legacy null-mode sessions runtime-only even when minimum-feed is requested", async () => {
    const repository = new EvidenceRepository();
    const session = makeSession();
    await repository.putSession({
      ...session,
      data: { ...session.data, workflow_mode: null },
    });
    await repository.putSnapshot(makeSnapshot());

    const minimumReport = await getExportPreflight(sessionId, "MINIMUM_PYTHON_FEED");
    expect(minimumReport.blockingErrors).toContain("EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH");
    expect(minimumReport.runtimeEvidenceFallbackAvailable).toBe(false);

    const runtimeReport = await getExportPreflight(sessionId, "RUNTIME_EVIDENCE");
    expect(runtimeReport.blockingErrors).toEqual([]);
  });
});
