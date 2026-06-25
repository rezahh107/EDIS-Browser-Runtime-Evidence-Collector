import { canonicalJson, compareCanonicalStrings, parseSafeJson } from "../domain/canonical";
import { effectiveSessionWorkflowMode } from "../domain/capturePolicy";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import { deterministicUuid } from "../domain/identifiers";
import {
  type BindingContext,
  type CaptureConfiguration,
  type CaptureJob,
  type CaptureSession,
  type PageProbeEvidence,
  type PythonFeedCaptureGuard,
  type RequestedViewportProfile,
  type RuntimeSnapshot,
  type ScreenshotRecord,
} from "../domain/model";
import type {
  CaptureStartPayload as StartPayload,
  ContentChunkPayload,
  ContentCompletePayload,
} from "../domain/messages";
import { isRuntimeSnapshot } from "../domain/validation";
import { ChromeBrowserAdapter } from "../infrastructure/browser/chromeAdapter";
import { dataUrlToBytes, sha256Hex } from "../infrastructure/checksum";
import {
  EvidenceRepository,
  FinalizationClaimLostError,
  LEGACY_UNVERIFIED_CHUNK_HASH,
  type ChunkRecord,
} from "../infrastructure/storage/indexedDb";
import { loadPreferences } from "../infrastructure/storage/preferences";
import { loadBindingContext } from "../infrastructure/storage/sourceContext";
import { diagnosticDisplayMessage } from "../domain/diagnostics";
import { computePageFingerprintEvidence } from "../domain/pageFingerprint";
import { evaluateGuidedPythonFeedCapture } from "../domain/pythonFeedCapture";
import type { ActiveTab } from "../infrastructure/browser/browserAdapter";
import {
  MAX_SCREENSHOT_BYTES,
  MAX_SESSION_CAPTURE_COUNT,
  MAX_SESSION_EVIDENCE_BYTES,
} from "../domain/resourceLimits";

const STALE_JOB_MS = 30_000;
const FINALIZATION_LEASE_MS = 60_000;
const ACTIVE_STATUSES = new Set<CaptureJob["status"]>([
  "PREPARED",
  "INJECTED",
  "RECEIVING",
  "ASSEMBLING",
]);

export class CaptureCoordinator {
  readonly #repository = new EvidenceRepository();
  readonly #browser = new ChromeBrowserAdapter();
  #recoveryPromise: Promise<void> | null = null;

  async probeCurrentPage(): Promise<PageProbeEvidence> {
    const activeTab = await this.#browser.getActiveTab();
    if (!activeTab.ok) throw new CoordinatorError(activeTab.error);
    const bindingContext = await loadBindingContext();
    return this.#probePage(activeTab.value, bindingContext);
  }

  async checkPythonFeedCapture(
    sessionId: string,
    requestedProfileId: RequestedViewportProfile,
  ): Promise<PythonFeedCaptureGuard> {
    const session = await this.#repository.getSession(sessionId);
    if (!session) throw new Error("Capture session does not exist.");
    const activeTab = await this.#browser.getActiveTab();
    if (!activeTab.ok) throw new CoordinatorError(activeTab.error);
    const bindingContext = await loadBindingContext();
    const probe = await this.#probePage(activeTab.value, bindingContext);
    return this.#evaluatePythonFeedCapture(session, requestedProfileId, bindingContext, probe);
  }

  async start(payload: StartPayload, requestId: string): Promise<CaptureJob> {
    await this.recoverInterruptedJobs();
    const session = await this.#repository.getSession(payload.sessionId);
    if (!session) throw new Error("Capture session does not exist.");
    const effectiveWorkflowMode = effectiveSessionWorkflowMode(
      session.data.workflow_mode,
      session.data.captures.length,
    );
    if (effectiveWorkflowMode !== null && effectiveWorkflowMode !== payload.workflowMode)
      throw new CoordinatorError(
        diagnostic(
          "EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH",
          "ERROR",
          "The capture workflow is locked for this session.",
          true,
          {
            session_workflow_mode: effectiveWorkflowMode,
            requested_workflow_mode: payload.workflowMode,
          },
        ),
      );
    const activeTab = await this.#browser.getActiveTab();
    if (!activeTab.ok) throw new CoordinatorError(activeTab.error);

    for (const existing of await this.#repository.listJobsByTab(activeTab.value.id)) {
      if (!ACTIVE_STATUSES.has(existing.status)) continue;
      if (this.#isStale(existing)) {
        await this.#terminateJob(
          existing,
          diagnostic(
            "EDIS_RUNTIME_WORKER_INTERRUPTED",
            "ERROR",
            "A stale persisted capture job was closed before a new capture began.",
            true,
          ),
          "INTERRUPTED",
        );
      } else {
        throw new CoordinatorError(
          diagnostic(
            "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_TAB",
            "ERROR",
            "A capture is already active for this tab.",
            true,
          ),
        );
      }
    }

    for (const existing of await this.#repository.listJobsBySession(payload.sessionId)) {
      if (existing.tabId === activeTab.value.id || !ACTIVE_STATUSES.has(existing.status)) continue;
      if (this.#isStale(existing)) {
        await this.#terminateJob(
          existing,
          diagnostic(
            "EDIS_RUNTIME_WORKER_INTERRUPTED",
            "ERROR",
            "A stale persisted session capture job was closed before a new capture began.",
            true,
          ),
          "INTERRUPTED",
        );
      } else {
        throw new CoordinatorError(
          diagnostic(
            "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_SESSION",
            "ERROR",
            "A capture is already active for this session.",
            true,
          ),
        );
      }
    }

    const bindingContext = await loadBindingContext();
    let expectedPageFingerprint: PageProbeEvidence["page_fingerprint"] | null = null;
    let expectedViewportWidth: number | null = null;
    if (payload.workflowMode === "MINIMUM_PYTHON_FEED") {
      const probe = await this.#probePage(activeTab.value, bindingContext);
      const guard = await this.#evaluatePythonFeedCapture(
        session,
        payload.requestedProfileId,
        bindingContext,
        probe,
      );
      if (!guard.allowed) throw new CoordinatorError(this.#guardDiagnostic(guard));
      expectedPageFingerprint = probe.page_fingerprint;
      expectedViewportWidth = probe.inner_width;
    }

    const preferences = { ...(await loadPreferences()), ...(payload.overrides ?? {}) };
    if (session.data.captures.length >= MAX_SESSION_CAPTURE_COUNT)
      throw new CoordinatorError(
        diagnostic(
          "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
          "ERROR",
          "The capture session reached its bounded observation limit.",
          true,
          { limit: MAX_SESSION_CAPTURE_COUNT },
        ),
      );
    const resourceUsage = await this.#repository.getSessionResourceUsage(payload.sessionId);
    const projectedBytes =
      resourceUsage.totalBytes +
      preferences.maxSnapshotBytes +
      (preferences.includeScreenshot ? MAX_SCREENSHOT_BYTES : 0);
    if (!Number.isSafeInteger(projectedBytes) || projectedBytes > MAX_SESSION_EVIDENCE_BYTES)
      throw new CoordinatorError(
        diagnostic(
          "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
          "ERROR",
          "The next capture could make the session impossible to export safely.",
          true,
          {
            current_bytes: resourceUsage.totalBytes,
            projected_bytes: projectedBytes,
            limit: MAX_SESSION_EVIDENCE_BYTES,
          },
        ),
      );
    const sequence = await this.#repository.allocateSequence(`capture-${payload.sessionId}`);
    const now = new Date().toISOString();
    const snapshotId = await deterministicUuid(
      "edis.runtime.snapshot",
      `${payload.sessionId}:${sequence}`,
    );
    const jobId = await deterministicUuid("edis.runtime.job", snapshotId);
    const configuration: CaptureConfiguration = {
      ...preferences,
      sessionId: payload.sessionId,
      snapshotId,
      userLabel: payload.userLabel.trim(),
      evidenceLabel: payload.evidenceLabel,
      requestedProfileId: payload.requestedProfileId,
      workflowMode: payload.workflowMode,
      expectedPageFingerprint,
      expectedViewportWidth,
      captureIntent: payload.captureIntent ?? preferences.captureIntent,
      observationIndex: session.data.captures.length,
      capturedAt: now,
      bindingContext,
    };
    let job: CaptureJob = {
      id: jobId,
      requestId,
      sessionId: payload.sessionId,
      snapshotId,
      tabId: activeTab.value.id,
      windowId: activeTab.value.windowId,
      documentUrl: activeTab.value.url,
      documentId: null,
      createdAt: now,
      updatedAt: now,
      status: "PREPARED",
      expectedChunks: null,
      receivedChunks: 0,
      config: configuration,
      diagnostics: [],
    };
    const capturingSession: CaptureSession = {
      ...session,
      data: {
        ...session.data,
        workflow_mode: effectiveWorkflowMode ?? payload.workflowMode,
        status: "CAPTURING",
      },
    };
    try {
      await this.#repository.beginCapture(job, capturingSession);
    } catch (error: unknown) {
      if (error instanceof Error && isConcurrentCaptureStartError(error.message)) {
        const code = error.message.includes("this tab")
          ? "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_TAB"
          : error.message.includes("this session")
            ? "EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_SESSION"
            : "EDIS_RUNTIME_MESSAGE_REJECTED";
        throw new CoordinatorError(diagnostic(code, "ERROR", error.message, true));
      }
      throw error;
    }

    const injected = await this.#browser.injectCollector(job.tabId);
    if (!injected.ok) {
      await this.#terminateJob(job, injected.error, "FAILED");
      throw new CoordinatorError(injected.error);
    }
    job = { ...job, status: "INJECTED", updatedAt: new Date().toISOString() };
    await this.#repository.putJob(job);
    return job;
  }

  async configurationForTab(
    tabId: number,
    claimedUrl: string,
    senderUrl: string,
    documentId: string | null,
  ): Promise<{ jobId: string; configuration: CaptureConfiguration } | null> {
    if (claimedUrl !== senderUrl) return null;
    const candidates = (await this.#repository.listJobsByTab(tabId)).filter(
      (job) =>
        ACTIVE_STATUSES.has(job.status) &&
        job.documentUrl === senderUrl &&
        (job.documentId === null || documentId === null || job.documentId === documentId),
    );
    if (candidates.length !== 1) return null;
    const candidate = candidates[0];
    if (!candidate) return null;
    let job: CaptureJob = candidate;
    if (job.documentId === null && documentId !== null) {
      job = { ...job, documentId, updatedAt: new Date().toISOString() };
      await this.#repository.putJob(job);
    }
    return { jobId: job.id, configuration: job.config };
  }

  async acceptChunk(
    tabId: number,
    senderUrl: string,
    documentId: string | null,
    payload: ContentChunkPayload,
  ): Promise<void> {
    const job = await this.#requireActiveJob(payload.jobId, tabId, senderUrl, documentId);
    if (job.expectedChunks !== null && job.expectedChunks !== payload.total)
      throw new Error("Chunk total changed during capture.");
    const encoded = new TextEncoder().encode(payload.data);
    if (encoded.length !== payload.byteLength || (await sha256Hex(encoded)) !== payload.sha256)
      throw new Error("Chunk integrity validation failed.");

    const record: ChunkRecord = {
      key: `${job.id}:${payload.index.toString().padStart(6, "0")}`,
      jobId: job.id,
      index: payload.index,
      data: payload.data,
      sha256: payload.sha256,
      byteLength: payload.byteLength,
    };
    const updated: CaptureJob = {
      ...job,
      status: "RECEIVING",
      expectedChunks: payload.total,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.#repository.commitChunk(updated, record, job.config.maxSnapshotBytes);
    } catch (error: unknown) {
      if (error instanceof Error && /size limit/i.test(error.message))
        throw new CoordinatorError(
          diagnostic(
            "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT",
            "ERROR",
            "Buffered capture chunks exceeded the configured snapshot size limit.",
            true,
            { limit: job.config.maxSnapshotBytes },
          ),
        );
      throw error;
    }
  }

  async complete(
    tabId: number,
    senderUrl: string,
    documentId: string | null,
    payload: ContentCompletePayload,
  ): Promise<CaptureJob> {
    const existing = await this.#repository.getJob(payload.jobId);
    if (
      existing?.status === "COMPLETE" &&
      existing.tabId === tabId &&
      existing.documentUrl === senderUrl &&
      (existing.documentId === null || documentId === null || existing.documentId === documentId)
    )
      return existing;
    const job = await this.#requireActiveJob(payload.jobId, tabId, senderUrl, documentId);
    return this.#finalize(job, payload.total, payload.snapshotSha256, payload.byteLength);
  }

  async status(jobId: string): Promise<CaptureJob | undefined> {
    const job = await this.#repository.getJob(jobId);
    if (!job || !ACTIVE_STATUSES.has(job.status)) return job;
    const aggregate = await this.#repository.getChunkAggregate(job.id);
    if (job.expectedChunks !== null && aggregate?.count === job.expectedChunks) {
      try {
        return await this.#finalize(job, job.expectedChunks, null, null);
      } catch {
        return this.#repository.getJob(jobId);
      }
    }
    if (this.#isStale(job)) {
      await this.#terminateJob(
        job,
        diagnostic(
          "EDIS_RUNTIME_WORKER_INTERRUPTED",
          "ERROR",
          "The persisted capture job stopped producing progress and was closed safely.",
          true,
        ),
        "INTERRUPTED",
      );
      return this.#repository.getJob(jobId);
    }
    return job;
  }

  async isActive(
    jobId: string,
    tabId: number,
    senderUrl: string,
    documentId: string | null,
  ): Promise<boolean> {
    const job = await this.status(jobId);
    return Boolean(
      job &&
      job.tabId === tabId &&
      job.documentUrl === senderUrl &&
      (job.documentId === null || documentId === null || job.documentId === documentId) &&
      ACTIVE_STATUSES.has(job.status),
    );
  }

  async cancel(jobId: string): Promise<CaptureJob> {
    const job = await this.#repository.getJob(jobId);
    if (!job) throw new Error("Capture job not found.");
    if (!ACTIVE_STATUSES.has(job.status)) return job;
    const reason = diagnostic(
      "EDIS_RUNTIME_CAPTURE_CANCELLED",
      "INFO",
      "Capture was cancelled by the user.",
      true,
    );
    await this.#terminateJob(job, reason, "CANCELLED");
    const cancelled = await this.#repository.getJob(jobId);
    if (!cancelled) throw new Error("Cancelled capture job could not be reloaded.");
    return cancelled;
  }

  async failFromContent(
    tabId: number,
    senderUrl: string,
    documentId: string | null,
    jobId: string,
    code: string,
  ): Promise<void> {
    const job = await this.#requireActiveJob(jobId, tabId, senderUrl, documentId);
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
    await this.#terminateJob(
      job,
      mapped,
      code === "EDIS_RUNTIME_CAPTURE_CANCELLED" ? "CANCELLED" : "FAILED",
    );
  }

  async handleNavigation(tabId: number): Promise<void> {
    const jobs = await this.#repository.listJobsByTab(tabId);
    for (const job of jobs.filter((candidate) => ACTIVE_STATUSES.has(candidate.status))) {
      await this.#terminateJob(
        job,
        diagnostic(
          "EDIS_RUNTIME_TAB_NAVIGATED",
          "ERROR",
          "The tab navigated before capture completed.",
          true,
        ),
        "NAVIGATED",
      );
    }
  }

  async recoverInterruptedJobs(): Promise<void> {
    this.#recoveryPromise ??= this.#recoverInterruptedJobsInternal().finally(() => {
      this.#recoveryPromise = null;
    });
    return this.#recoveryPromise;
  }

  async #recoverInterruptedJobsInternal(): Promise<void> {
    await this.#repository.maintainInternalStateIfDue(Date.now());
    for (const job of await this.#repository.listActiveJobs()) {
      if (!ACTIVE_STATUSES.has(job.status)) continue;
      const chunks = await this.#repository.listChunks(job.id);
      if (
        chunks.some(
          (chunk) =>
            chunk.integrityStatus === "LEGACY_UNVERIFIED" ||
            chunk.sha256 === LEGACY_UNVERIFIED_CHUNK_HASH,
        )
      ) {
        await this.#terminateJob(
          job,
          diagnostic(
            "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
            "ERROR",
            "Legacy persisted chunks cannot be recovered without a supplied full-snapshot checksum.",
            false,
            { reason: "legacy_chunk_hash_absent" },
            "OPERATIONAL",
          ),
          "FAILED",
        );
        continue;
      }
      if (
        job.expectedChunks !== null &&
        chunks.length === job.expectedChunks &&
        chunks.every((chunk, index) => chunk.index === index)
      ) {
        try {
          await this.#finalize(job, job.expectedChunks, null, null);
          continue;
        } catch {
          const current = await this.#repository.getJob(job.id);
          if (!current || !ACTIVE_STATUSES.has(current.status)) continue;
          await this.#terminateJob(
            current,
            diagnostic(
              "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
              "ERROR",
              "Persisted capture chunks failed integrity validation during recovery.",
              false,
            ),
            "FAILED",
          );
          continue;
        }
      }
      if (!this.#isStale(job)) continue;
      await this.#terminateJob(
        job,
        diagnostic(
          "EDIS_RUNTIME_WORKER_INTERRUPTED",
          "ERROR",
          "A persisted capture job could not be resumed after interruption.",
          true,
        ),
        "INTERRUPTED",
      );
    }
  }

  async #probePage(
    activeTab: ActiveTab,
    bindingContext: BindingContext | null,
  ): Promise<PageProbeEvidence> {
    const rawProbe = await this.#browser.probePage(activeTab.id);
    if (!rawProbe.ok) throw new CoordinatorError(rawProbe.error);
    if (rawProbe.value.url !== activeTab.url)
      throw new CoordinatorError(
        diagnostic(
          "EDIS_RUNTIME_TAB_NAVIGATED",
          "ERROR",
          "The active page changed while it was being measured.",
          true,
        ),
      );
    const fingerprint = await computePageFingerprintEvidence({
      rawUrl: rawProbe.value.url,
      pageMarkerPresent: rawProbe.value.pageMarkerPresent,
      rawDataElementorIds: rawProbe.value.rawDataElementorIds,
      bindingContext,
    });
    return {
      url: rawProbe.value.url,
      inner_width: rawProbe.value.innerWidth,
      inner_height: rawProbe.value.innerHeight,
      page_fingerprint: fingerprint.page_fingerprint,
      scroll_x: rawProbe.value.scrollX,
      scroll_y: rawProbe.value.scrollY,
      document_visibility_state: rawProbe.value.documentVisibilityState,
      document_prerendering: rawProbe.value.documentPrerendering,
      admin_bar: {
        body_admin_bar_class: rawProbe.value.adminBar.bodyAdminBarClass,
        wpadminbar_element_present: rawProbe.value.adminBar.wpadminbarElementPresent,
        wpadminbar_computed_display: rawProbe.value.adminBar.wpadminbarComputedDisplay,
        wpadminbar_computed_visibility: rawProbe.value.adminBar.wpadminbarComputedVisibility,
        wpadminbar_rect_height: rawProbe.value.adminBar.wpadminbarRectHeight,
        html_computed_margin_top: rawProbe.value.adminBar.htmlComputedMarginTop,
        body_computed_margin_top: rawProbe.value.adminBar.bodyComputedMarginTop,
        detection_state: rawProbe.value.adminBar.detectionState,
      },
      elementor_editor_preview_present: rawProbe.value.elementorEditorPreviewPresent,
      iframe_capture: rawProbe.value.iframeCapture,
      viewport_image_readiness: {
        candidate_count: rawProbe.value.viewportImageReadiness.candidateCount,
        loaded_count: rawProbe.value.viewportImageReadiness.loadedCount,
        broken_count: rawProbe.value.viewportImageReadiness.brokenCount,
        pending_count: rawProbe.value.viewportImageReadiness.pendingCount,
        decode_failed_count: rawProbe.value.viewportImageReadiness.decodeFailedCount,
        timed_out_count: rawProbe.value.viewportImageReadiness.timedOutCount,
        wait_time_ms: rawProbe.value.viewportImageReadiness.waitTimeMs,
        timeout_ms: rawProbe.value.viewportImageReadiness.timeoutMs,
        timeout_policy_id: rawProbe.value.viewportImageReadiness.timeoutPolicyId,
        timeout_policy_version: rawProbe.value.viewportImageReadiness.timeoutPolicyVersion,
      },
    };
  }

  async #evaluatePythonFeedCapture(
    session: CaptureSession,
    requestedProfileId: RequestedViewportProfile,
    bindingContext: BindingContext | null,
    probe: PageProbeEvidence,
  ): Promise<PythonFeedCaptureGuard> {
    return evaluateGuidedPythonFeedCapture({
      session,
      snapshots: await this.#repository.listSnapshotsBySession(session.data.session_id),
      bindingContext,
      probe,
      requestedProfileId,
    });
  }

  #guardDiagnostic(guard: PythonFeedCaptureGuard): Diagnostic {
    const code = guard.blocking_codes[0];
    if (!code) throw new Error("Python Feed guard rejected without a diagnostic code.");
    return diagnostic(
      code as Diagnostic["code"],
      "ERROR",
      "The guided Python Feed capture requirements were not satisfied.",
      true,
      {
        measured_width: guard.measured_viewport.width,
        measured_height: guard.measured_viewport.height,
        existing_widths: guard.existing_viewport_widths.map(String),
        existing_profiles: guard.existing_requested_profiles,
        policy_id: guard.policy_id,
        policy_version: guard.policy_version,
      },
    );
  }

  async #finalize(
    initialJob: CaptureJob,
    total: number,
    expectedHash: string | null,
    expectedBytes: number | null,
  ): Promise<CaptureJob> {
    const claimSequence = await this.#repository.allocateSequence("finalization-claim");
    const claimOwner = await deterministicUuid(
      "edis.runtime.finalization-claim",
      `${initialJob.id}:${claimSequence}`,
    );
    const claimedJob = await this.#repository.claimFinalization(
      initialJob.id,
      claimOwner,
      Date.now(),
      FINALIZATION_LEASE_MS,
      total,
    );
    if (!claimedJob) return (await this.#repository.getJob(initialJob.id)) ?? initialJob;
    try {
      if (claimedJob.expectedChunks !== null && claimedJob.expectedChunks !== total)
        throw await this.#failFinalization(
          claimedJob,
          "The final chunk count did not match the active capture job.",
          "final_chunk_count",
        );
      let job: CaptureJob = {
        ...claimedJob,
        expectedChunks: total,
      };

      let chunks = await this.#repository.listChunks(job.id);
      if (chunks.length !== total || chunks.some((chunk, index) => chunk.index !== index))
        throw await this.#failFinalization(
          job,
          "Capture chunks were incomplete or out of sequence.",
          "chunk_sequence",
        );
      const legacyUnverifiedChunks = chunks.filter(
        (chunk) =>
          chunk.integrityStatus === "LEGACY_UNVERIFIED" ||
          chunk.sha256 === LEGACY_UNVERIFIED_CHUNK_HASH,
      );
      if (legacyUnverifiedChunks.length > 0 && expectedHash === null)
        throw await this.#failFinalization(
          job,
          "Legacy persisted chunks had no per-chunk hash and no full-snapshot checksum was available.",
          "legacy_chunk_integrity_unavailable",
        );

      let assembledByteLength = 0;
      for (const chunk of chunks) {
        assembledByteLength += chunk.byteLength;
        if (!Number.isSafeInteger(assembledByteLength))
          throw await this.#failFinalization(
            job,
            "The assembled snapshot byte length was invalid.",
            "assembled_size_checksum",
          );
      }

      if (
        assembledByteLength > job.config.maxSnapshotBytes ||
        (expectedBytes !== null && assembledByteLength !== expectedBytes)
      )
        throw await this.#failFinalization(
          job,
          "The assembled snapshot failed size validation.",
          "assembled_size_checksum",
        );

      let serializedBytes: Uint8Array | null = new Uint8Array(assembledByteLength);
      let byteOffset = 0;
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        const bytes = encoder.encode(chunk.data);
        const requiresPerChunkVerification =
          chunk.integrityStatus !== "LEGACY_UNVERIFIED" &&
          chunk.sha256 !== LEGACY_UNVERIFIED_CHUNK_HASH;
        if (
          bytes.length !== chunk.byteLength ||
          (requiresPerChunkVerification && (await sha256Hex(bytes)) !== chunk.sha256)
        )
          throw await this.#failFinalization(
            job,
            "A persisted capture chunk failed integrity validation.",
            "chunk_integrity",
          );
        serializedBytes.set(bytes, byteOffset);
        byteOffset += bytes.length;
      }
      if (byteOffset !== assembledByteLength)
        throw await this.#failFinalization(
          job,
          "The assembled snapshot byte length was invalid.",
          "assembled_size_checksum",
        );
      if (expectedHash !== null && (await sha256Hex(serializedBytes)) !== expectedHash)
        throw await this.#failFinalization(
          job,
          "The assembled snapshot failed checksum validation.",
          "assembled_size_checksum",
        );

      const decoded = decodeCanonicalRuntimeSnapshot(serializedBytes);
      serializedBytes = null;
      if (!decoded.ok) {
        throw await this.#failFinalization(
          job,
          decoded.reason === "INVALID_UTF8"
            ? "The assembled snapshot was not valid UTF-8."
            : "The content snapshot was not valid canonical EDIS JSON.",
          "canonical_snapshot",
        );
      }
      let snapshot: RuntimeSnapshot = decoded.snapshot;
      if (legacyUnverifiedChunks.length > 0) {
        snapshot = {
          ...snapshot,
          diagnostics: [
            ...snapshot.diagnostics,
            diagnostic(
              "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT",
              "WARNING",
              "Legacy chunks lacked per-chunk hashes but passed the supplied full-snapshot checksum.",
              true,
              {
                reason: "legacy_chunk_hash_absent",
                chunk_count: legacyUnverifiedChunks.length,
              },
              "OPERATIONAL",
            ),
          ],
        };
      }
      const chunkKeys = chunks.map((chunk) => chunk.key);
      chunks = [];
      if (
        snapshot.snapshot_id !== job.snapshotId ||
        snapshot.session_id !== job.sessionId ||
        snapshot.captured_at !== job.config.capturedAt ||
        snapshot.elements.length > job.config.maxElements
      )
        throw await this.#failFinalization(
          job,
          "Snapshot identity, timestamp, or element budget did not match the active capture job.",
          "snapshot_identity_budget",
        );

      if (
        job.config.workflowMode === "MINIMUM_PYTHON_FEED" &&
        (snapshot.page.page_fingerprint !== job.config.expectedPageFingerprint ||
          snapshot.viewport.inner_width !== job.config.expectedViewportWidth)
      )
        throw await this.#failFinalization(
          job,
          "The page or measured viewport changed after Python Feed capture approval.",
          "python_feed_capture_changed",
        );

      if (
        job.config.workflowMode === "MINIMUM_PYTHON_FEED" &&
        (Math.abs(snapshot.capture_state.scroll_x) > 1 ||
          Math.abs(snapshot.capture_state.scroll_y) > 1 ||
          snapshot.capture_state.document_visibility_state !== "visible" ||
          snapshot.capture_state.document_prerendering ||
          snapshot.capture_environment.admin_bar.detection_state !== "ABSENT" ||
          snapshot.capture_environment.elementor_editor_preview_present ||
          snapshot.capture_environment.iframe_capture ||
          snapshot.capture_readiness.viewport_image_readiness.broken_count +
            snapshot.capture_readiness.viewport_image_readiness.pending_count +
            snapshot.capture_readiness.viewport_image_readiness.decode_failed_count +
            snapshot.capture_readiness.viewport_image_readiness.timed_out_count >
            0)
      )
        throw await this.#failFinalization(
          job,
          "The canonical Python Feed capture environment changed or was not ready.",
          "python_feed_environment_changed",
        );

      if (
        !(await this.#repository.renewFinalizationClaim(
          job.id,
          claimOwner,
          Date.now(),
          FINALIZATION_LEASE_MS,
        ))
      )
        return (await this.#repository.getJob(job.id)) ?? job;

      let screenshot: ScreenshotRecord | null = null;
      if (job.config.includeScreenshot) {
        const captured = await this.#captureScreenshot(job);
        if (captured.ok) screenshot = captured.value;
        else {
          snapshot = {
            ...snapshot,
            status: "PARTIAL",
            diagnostics: [...snapshot.diagnostics, captured.error],
          };
        }
      }

      const session = await this.#repository.getSession(job.sessionId);
      if (!session) throw new Error("Session disappeared during capture.");
      const overflowCount = snapshot.elements.filter(
        (element) =>
          element.overflow.horizontal_overflow ||
          element.overflow.vertical_overflow ||
          element.overflow.clipped_by_ancestor,
      ).length;
      const summary = {
        snapshot_id: snapshot.snapshot_id,
        label: snapshot.viewport.user_label,
        captured_at: snapshot.captured_at,
        actual_width: snapshot.viewport.inner_width,
        actual_height: snapshot.viewport.inner_height,
        page_context_id: snapshot.page.page_context_id,
        page_fingerprint: snapshot.page.page_fingerprint,
        page_binding_state: snapshot.page.page_binding_evidence.binding_state,
        page_binding_reason_codes: snapshot.page.page_binding_evidence.reason_codes,
        source_document_id: snapshot.page.page_binding_evidence.source_document_id,
        source_document_type:
          snapshot.page.source_documents_present.find(
            (item) => item.document_id === snapshot.page.page_binding_evidence.source_document_id,
          )?.document_type ?? null,
        source_document_count: snapshot.page_structure_summary.source_document_count,
        source_section_count: snapshot.page_structure_summary.source_section_count,
        source_widget_count: snapshot.page_structure_summary.source_widget_count,
        runtime_region_count: snapshot.page_structure_summary.runtime_region_count,
        runtime_section_region_count: snapshot.page_structure_summary.runtime_section_region_count,
        runtime_container_region_count:
          snapshot.page_structure_summary.runtime_container_region_count,
        runtime_widget_marker_count: snapshot.page_structure_summary.runtime_widget_marker_count,
        exact_binding_count: snapshot.page_structure_summary.exact_binding_count,
        probable_binding_count: snapshot.page_structure_summary.probable_binding_count,
        ambiguous_binding_count: snapshot.page_structure_summary.ambiguous_binding_count,
        unmatched_runtime_node_count: snapshot.page_structure_summary.unmatched_runtime_node_count,
        element_count: snapshot.elements.length,
        overflow_count: overflowCount,
        diagnostic_count: snapshot.diagnostics.length,
        screenshot_available: screenshot !== null,
        completeness_status: snapshot.capture_completeness.status,
        partial_reasons: snapshot.capture_completeness.reasons,
        truncated_branch_count: snapshot.capture_completeness.truncated_branch_count,
        identity_collision_count: snapshot.capture_completeness.identity_collision_count,
        skipped_hidden_subtree_count: snapshot.capture_completeness.skipped_hidden_subtree_count,
        capture_environment_warning_count: snapshot.capture_environment.warning_codes.length,
        status: snapshot.status === "AVAILABLE" ? ("COMPLETE" as const) : ("PARTIAL" as const),
      };
      const captures = [
        ...session.data.captures.filter((item) => item.snapshot_id !== snapshot.snapshot_id),
        summary,
      ].sort(
        (left, right) =>
          compareCanonicalStrings(left.captured_at, right.captured_at) ||
          compareCanonicalStrings(left.snapshot_id, right.snapshot_id),
      );
      const updatedSession: CaptureSession = {
        ...session,
        diagnostics: [...session.diagnostics, ...snapshot.diagnostics],
        data: {
          ...session.data,
          status: snapshot.status === "AVAILABLE" ? "COMPLETE" : "PARTIAL",
          browser_family: snapshot.runtime_environment.browser_family,
          browser_version: snapshot.runtime_environment.browser_version,
          runtime_environment: snapshot.runtime_environment,
          source_context_reference: snapshot.source_context_reference,
          source_binding_state: snapshot.elements.some(
            (item) => item.source_binding.binding_state === "EXACT",
          )
            ? "EXACT"
            : snapshot.elements.some((item) => item.source_binding.binding_state === "PROBABLE")
              ? "PROBABLE"
              : snapshot.elements.some((item) => item.source_binding.binding_state === "AMBIGUOUS")
                ? "AMBIGUOUS"
                : "UNMATCHED",
          captures,
        },
      };
      job = {
        ...job,
        status: "COMPLETE",
        updatedAt: new Date().toISOString(),
        diagnostics: [...job.diagnostics, ...snapshot.diagnostics],
      };
      if (
        !(await this.#repository.renewFinalizationClaim(
          job.id,
          claimOwner,
          Date.now(),
          FINALIZATION_LEASE_MS,
        ))
      )
        return (await this.#repository.getJob(job.id)) ?? job;
      try {
        await this.#repository.commitCapture(
          snapshot,
          screenshot,
          updatedSession,
          job,
          chunkKeys,
          claimOwner,
          assembledByteLength,
        );
      } catch (error: unknown) {
        if (error instanceof FinalizationClaimLostError)
          return (await this.#repository.getJob(job.id)) ?? job;
        throw await this.#failFinalization(
          job,
          "The atomic capture commit transaction failed validation or persistence.",
          "commit_capture",
        );
      }
      return job;
    } finally {
      await this.#repository
        .releaseFinalizationClaim(initialJob.id, claimOwner)
        .catch(() => undefined);
    }
  }

  async #failFinalization(
    job: CaptureJob,
    message: string,
    stage: string | null = null,
  ): Promise<CoordinatorError> {
    const item = diagnostic(
      "EDIS_RUNTIME_SERIALIZATION_FAILED",
      "ERROR",
      message,
      false,
      stage === null ? {} : { stage },
    );
    await this.#terminateJob(job, item, "FAILED");
    return new CoordinatorError(item);
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
    if (bytes.length > MAX_SCREENSHOT_BYTES) {
      return {
        ok: false,
        error: diagnostic(
          "EDIS_RUNTIME_SCREENSHOT_FAILED",
          "WARNING",
          "Screenshot exceeded the local storage safety limit and was omitted.",
          true,
          { limit: MAX_SCREENSHOT_BYTES, bytes: bytes.length },
        ),
      };
    }
    const screenshotBuffer: ArrayBuffer =
      bytes.buffer instanceof ArrayBuffer &&
      bytes.byteOffset === 0 &&
      bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : Uint8Array.from(bytes).buffer;
    return {
      ok: true,
      value: {
        snapshotId: job.snapshotId,
        sessionId: job.sessionId,
        mimeType: "image/png",
        bytes: screenshotBuffer,
        checksumSha256: await sha256Hex(bytes),
        createdAt: job.config.capturedAt,
      },
    };
  }

  async #requireActiveJob(
    jobId: string,
    tabId: number,
    senderUrl: string,
    documentId: string | null,
  ): Promise<CaptureJob> {
    const job = await this.#repository.getJob(jobId);
    if (
      !job ||
      job.tabId !== tabId ||
      job.documentUrl !== senderUrl ||
      !ACTIVE_STATUSES.has(job.status) ||
      (job.documentId !== null && documentId !== null && job.documentId !== documentId)
    )
      throw new Error("Active capture job not found for sender document.");
    return job;
  }

  async #terminateJob(
    job: CaptureJob,
    reason: Diagnostic,
    status: CaptureJob["status"],
  ): Promise<void> {
    const terminated: CaptureJob = {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      diagnostics: [...job.diagnostics, reason],
    };
    const session = await this.#repository.getSession(job.sessionId);
    let updatedSession: CaptureSession | null = null;
    if (session) {
      const hasCaptures = session.data.captures.length > 0;
      const dataStatus: CaptureSession["data"]["status"] = hasCaptures
        ? "PARTIAL"
        : status === "CANCELLED"
          ? "CANCELLED"
          : "FAILED";
      updatedSession = {
        ...session,
        diagnostics: [...session.diagnostics, reason],
        data: { ...session.data, status: dataStatus },
      };
    }
    const chunks = await this.#repository.listChunks(job.id);
    await this.#repository.terminateCapture(
      terminated,
      updatedSession,
      chunks.map((chunk) => chunk.key),
    );
  }

  #isStale(job: CaptureJob): boolean {
    const age = Date.now() - Date.parse(job.updatedAt);
    return !Number.isFinite(age) || age >= STALE_JOB_MS;
  }
}

function decodeCanonicalRuntimeSnapshot(
  bytes: Uint8Array,
):
  | { readonly ok: true; readonly snapshot: RuntimeSnapshot }
  | { readonly ok: false; readonly reason: "INVALID_UTF8" | "INVALID_CANONICAL_SNAPSHOT" } {
  let serialized: string;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "INVALID_UTF8" };
  }
  const parsed = parseSafeJson(serialized);
  if (canonicalJson(parsed) !== serialized || !isRuntimeSnapshot(parsed))
    return { ok: false, reason: "INVALID_CANONICAL_SNAPSHOT" };
  return { ok: true, snapshot: parsed };
}

function isConcurrentCaptureStartError(message: string): boolean {
  return (
    /capture is already active/i.test(message) || /observation index was reserved/i.test(message)
  );
}

export class CoordinatorError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnosticDisplayMessage(diagnostic));
    this.name = "CoordinatorError";
  }
}
