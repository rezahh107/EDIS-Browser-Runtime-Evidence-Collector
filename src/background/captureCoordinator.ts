import { parseSafeJson } from "../domain/canonical";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import {
  type CaptureConfiguration,
  type CaptureJob,
  type CaptureSession,
  type RuntimeSnapshot,
  type ScreenshotRecord,
} from "../domain/model";
import type { CaptureStartPayload as StartPayload } from "../domain/messages";
import { isRuntimeSnapshot } from "../domain/validation";
import { ChromeBrowserAdapter } from "../infrastructure/browser/chromeAdapter";
import { dataUrlToBytes, sha256Hex } from "../infrastructure/checksum";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import { loadPreferences } from "../infrastructure/storage/preferences";

const ACTIVE_JOB_PREFIX = "pendingCapture:";
const ACTIVE_STATUSES = new Set<CaptureJob["status"]>([
  "PREPARED",
  "INJECTED",
  "RECEIVING",
  "ASSEMBLING",
]);

export class CaptureCoordinator {
  readonly #repository = new EvidenceRepository();
  readonly #browser = new ChromeBrowserAdapter();

  async start(payload: StartPayload, requestId: string): Promise<CaptureJob> {
    const session = await this.#repository.getSession(payload.sessionId);
    if (!session) throw new Error("Capture session does not exist.");
    const activeTab = await this.#browser.getActiveTab();
    if (!activeTab.ok) throw new CoordinatorError(activeTab.error);
    const preferences = { ...(await loadPreferences()), ...(payload.overrides ?? {}) };
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    const snapshotId = crypto.randomUUID();
    const configuration: CaptureConfiguration = {
      ...preferences,
      sessionId: payload.sessionId,
      snapshotId,
      userLabel: payload.userLabel.trim(),
      evidenceLabel: payload.evidenceLabel,
      officialBreakpointId: payload.officialBreakpointId,
    };
    let job: CaptureJob = {
      id: jobId,
      requestId,
      sessionId: payload.sessionId,
      snapshotId,
      tabId: activeTab.value.id,
      windowId: activeTab.value.windowId,
      documentUrl: activeTab.value.url,
      createdAt: now,
      updatedAt: now,
      status: "PREPARED",
      expectedChunks: null,
      receivedChunks: 0,
      config: configuration,
      diagnostics: [],
    };
    await this.#repository.putJob(job);
    await chrome.storage.session.set({ [`${ACTIVE_JOB_PREFIX}${job.tabId}`]: job.id });
    await this.#updateSessionStatus(session, "CAPTURING");
    const injected = await this.#browser.injectCollector(job.tabId);
    if (!injected.ok) {
      job = this.#withFailure(job, injected.error, "FAILED");
      await this.#repository.putJob(job);
      await this.#clearPending(job.tabId);
      await this.#updateSessionStatus(session, "FAILED");
      throw new CoordinatorError(injected.error);
    }
    job = { ...job, status: "INJECTED", updatedAt: new Date().toISOString() };
    await this.#repository.putJob(job);
    return job;
  }

  async configurationForTab(
    tabId: number,
    tabUrl: string,
  ): Promise<{ jobId: string; configuration: CaptureConfiguration } | null> {
    const stored = await chrome.storage.session.get(`${ACTIVE_JOB_PREFIX}${tabId}`);
    const jobId = stored[`${ACTIVE_JOB_PREFIX}${tabId}`];
    if (typeof jobId !== "string") return null;
    const job = await this.#repository.getJob(jobId);
    if (
      !job ||
      !ACTIVE_STATUSES.has(job.status) ||
      job.tabId !== tabId ||
      job.documentUrl !== tabUrl
    )
      return null;
    return { jobId: job.id, configuration: job.config };
  }

  async acceptChunk(
    tabId: number,
    payload: { jobId: string; index: number; total: number; data: string },
  ): Promise<void> {
    const job = await this.#requireActiveJob(payload.jobId, tabId);
    if (job.expectedChunks !== null && job.expectedChunks !== payload.total)
      throw new Error("Chunk total changed during capture.");
    await this.#repository.putChunk(job.id, payload.index, payload.data);
    const chunks = await this.#repository.listChunks(job.id);
    const updated: CaptureJob = {
      ...job,
      status: "RECEIVING",
      expectedChunks: payload.total,
      receivedChunks: chunks.length,
      updatedAt: new Date().toISOString(),
    };
    await this.#repository.putJob(updated);
  }

  async complete(tabId: number, jobId: string, total: number): Promise<CaptureJob> {
    let job = await this.#requireActiveJob(jobId, tabId);
    job = {
      ...job,
      status: "ASSEMBLING",
      expectedChunks: total,
      updatedAt: new Date().toISOString(),
    };
    await this.#repository.putJob(job);
    const chunks = await this.#repository.listChunks(job.id);
    if (chunks.length !== total || chunks.some((chunk, index) => chunk.index !== index))
      throw new Error("Capture chunks are incomplete.");
    const serialized = chunks.map((chunk) => chunk.data).join("");
    if (new TextEncoder().encode(serialized).length > job.config.maxSnapshotBytes) {
      const limitDiagnostic = diagnostic(
        "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT",
        "ERROR",
        "The serialized snapshot exceeded the configured size limit.",
        true,
        { limit: job.config.maxSnapshotBytes },
      );
      await this.#failJob(job, limitDiagnostic);
      throw new CoordinatorError(limitDiagnostic);
    }
    const parsed = parseSafeJson(serialized);
    if (!isRuntimeSnapshot(parsed)) {
      const invalid = diagnostic(
        "EDIS_RUNTIME_SERIALIZATION_FAILED",
        "ERROR",
        "The content snapshot failed runtime validation.",
        false,
      );
      await this.#failJob(job, invalid);
      throw new CoordinatorError(invalid);
    }
    let snapshot: RuntimeSnapshot = parsed;
    if (
      snapshot.data.snapshot_id !== job.snapshotId ||
      snapshot.data.session_id !== job.sessionId
    ) {
      const mismatch = diagnostic(
        "EDIS_RUNTIME_MESSAGE_REJECTED",
        "ERROR",
        "Snapshot identity did not match the active capture job.",
        false,
      );
      await this.#failJob(job, mismatch);
      throw new CoordinatorError(mismatch);
    }
    await this.#repository.putSnapshot(snapshot);
    let screenshotAvailable = false;
    if (job.config.includeScreenshot) {
      const screenshot = await this.#captureScreenshot(job);
      if (screenshot.ok) {
        await this.#repository.putScreenshot(screenshot.value);
        screenshotAvailable = true;
      } else {
        snapshot = {
          ...snapshot,
          status: "PARTIAL",
          diagnostics: [...snapshot.diagnostics, screenshot.error],
        };
        await this.#repository.putSnapshot(snapshot);
      }
    }
    const session = await this.#repository.getSession(job.sessionId);
    if (!session) throw new Error("Session disappeared during capture.");
    const overflowCount = snapshot.data.elements.filter(
      (element) => element.horizontal_overflow || element.vertical_overflow,
    ).length;
    const updatedSession: CaptureSession = {
      ...session,
      status: snapshot.status === "AVAILABLE" ? "AVAILABLE" : "PARTIAL",
      diagnostics: [...session.diagnostics, ...snapshot.diagnostics],
      data: {
        ...session.data,
        status: snapshot.status === "AVAILABLE" ? "COMPLETE" : "PARTIAL",
        captures: [
          ...session.data.captures,
          {
            snapshot_id: snapshot.data.snapshot_id,
            label: snapshot.data.viewport.user_label,
            captured_at: snapshot.captured_at,
            actual_width: snapshot.data.viewport.inner_width,
            actual_height: snapshot.data.viewport.inner_height,
            element_count: snapshot.data.elements.length,
            overflow_count: overflowCount,
            diagnostic_count: snapshot.diagnostics.length,
            screenshot_available: screenshotAvailable,
            status: snapshot.status === "AVAILABLE" ? "COMPLETE" : "PARTIAL",
          },
        ],
      },
    };
    await this.#repository.putSession(updatedSession);
    job = {
      ...job,
      status: "COMPLETE",
      updatedAt: new Date().toISOString(),
      diagnostics: [...job.diagnostics, ...snapshot.diagnostics],
    };
    await this.#repository.putJob(job);
    await this.#repository.clearChunks(job.id);
    await this.#clearPending(job.tabId);
    return job;
  }

  async status(jobId: string): Promise<CaptureJob | undefined> {
    return this.#repository.getJob(jobId);
  }

  async isActive(jobId: string, tabId: number): Promise<boolean> {
    const job = await this.#repository.getJob(jobId);
    return Boolean(job && job.tabId === tabId && ACTIVE_STATUSES.has(job.status));
  }

  async cancel(jobId: string): Promise<CaptureJob> {
    const job = await this.#repository.getJob(jobId);
    if (!job) throw new Error("Capture job not found.");
    const cancelled = this.#withFailure(
      job,
      diagnostic(
        "EDIS_RUNTIME_CAPTURE_CANCELLED",
        "INFO",
        "Capture was cancelled by the user.",
        true,
      ),
      "CANCELLED",
    );
    await this.#repository.putJob(cancelled);
    await this.#repository.clearChunks(job.id);
    await this.#clearPending(job.tabId);
    return cancelled;
  }

  async failFromContent(tabId: number, jobId: string, code: string): Promise<void> {
    const job = await this.#requireActiveJob(jobId, tabId);
    const mapped =
      code === "EDIS_RUNTIME_TAB_NAVIGATED"
        ? diagnostic(
            "EDIS_RUNTIME_TAB_NAVIGATED",
            "ERROR",
            "The page navigated during capture.",
            true,
          )
        : code === "EDIS_RUNTIME_CAPTURE_CANCELLED"
          ? diagnostic("EDIS_RUNTIME_CAPTURE_CANCELLED", "INFO", "Capture was cancelled.", true)
          : code === "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT"
            ? diagnostic(
                "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT",
                "ERROR",
                "The snapshot exceeded the configured size limit.",
                true,
              )
            : diagnostic(
                "EDIS_RUNTIME_SERIALIZATION_FAILED",
                "ERROR",
                "The page collector failed to serialize evidence.",
                true,
              );
    await this.#failJob(job, mapped);
  }

  async handleNavigation(tabId: number): Promise<void> {
    const jobs = await this.#repository.listJobsByTab(tabId);
    for (const job of jobs.filter((candidate) => ACTIVE_STATUSES.has(candidate.status))) {
      const navigated = this.#withFailure(
        job,
        diagnostic(
          "EDIS_RUNTIME_TAB_NAVIGATED",
          "ERROR",
          "The tab navigated before capture completed.",
          true,
        ),
        "NAVIGATED",
      );
      await this.#repository.putJob(navigated);
      await this.#repository.clearChunks(job.id);
    }
    await this.#clearPending(tabId);
  }

  async recoverInterruptedJobs(): Promise<void> {
    const now = Date.now();
    for (const job of await this.#repository.listJobs()) {
      if (!ACTIVE_STATUSES.has(job.status)) continue;
      const age = now - Date.parse(job.updatedAt);
      if (!Number.isFinite(age) || age < 120_000) continue;
      const interrupted = this.#withFailure(
        job,
        diagnostic(
          "EDIS_RUNTIME_WORKER_INTERRUPTED",
          "ERROR",
          "A persisted capture job could not be resumed after interruption.",
          true,
        ),
        "INTERRUPTED",
      );
      await this.#repository.putJob(interrupted);
      await this.#repository.clearChunks(job.id);
      await this.#clearPending(job.tabId);
    }
  }

  async #captureScreenshot(
    job: CaptureJob,
  ): Promise<{ ok: true; value: ScreenshotRecord } | { ok: false; error: Diagnostic }> {
    const active = await this.#browser.getActiveTab();
    if (!active.ok || active.value.id !== job.tabId || active.value.url !== job.documentUrl) {
      return {
        ok: false,
        error: diagnostic(
          "EDIS_RUNTIME_SCREENSHOT_FAILED",
          "WARNING",
          "Screenshot was skipped because the original tab was no longer active.",
          true,
        ),
      };
    }
    const captured = await this.#browser.captureVisibleViewport(job.windowId);
    if (!captured.ok) return captured;
    const bytes = dataUrlToBytes(captured.value);
    return {
      ok: true,
      value: {
        snapshotId: job.snapshotId,
        sessionId: job.sessionId,
        mimeType: "image/png",
        bytes: Uint8Array.from(bytes).buffer,
        checksumSha256: await sha256Hex(bytes),
        createdAt: new Date().toISOString(),
      },
    };
  }

  async #requireActiveJob(jobId: string, tabId: number): Promise<CaptureJob> {
    const job = await this.#repository.getJob(jobId);
    if (!job || job.tabId !== tabId || !ACTIVE_STATUSES.has(job.status))
      throw new Error("Active capture job not found for sender tab.");
    return job;
  }

  async #failJob(job: CaptureJob, reason: Diagnostic): Promise<void> {
    await this.#repository.putJob(this.#withFailure(job, reason, "FAILED"));
    await this.#repository.clearChunks(job.id);
    await this.#clearPending(job.tabId);
  }

  #withFailure(job: CaptureJob, reason: Diagnostic, status: CaptureJob["status"]): CaptureJob {
    return {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      diagnostics: [...job.diagnostics, reason],
    };
  }

  async #updateSessionStatus(
    session: CaptureSession,
    status: CaptureSession["data"]["status"],
  ): Promise<void> {
    await this.#repository.putSession({ ...session, data: { ...session.data, status } });
  }

  async #clearPending(tabId: number): Promise<void> {
    await chrome.storage.session.remove(`${ACTIVE_JOB_PREFIX}${tabId}`);
  }
}

export class CoordinatorError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "CoordinatorError";
  }
}
