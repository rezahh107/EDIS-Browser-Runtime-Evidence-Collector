import { canonicalJson, canonicalJsonWithoutFinalNewline } from "../domain/canonical";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import {
  COLLECTOR_ID,
  COLLECTOR_VERSION,
  SCHEMA_VERSION,
  type CaptureConfiguration,
  type RuntimeSnapshot,
} from "../domain/model";
import {
  makeMessage,
  validateResponseEnvelope,
  ResponseEnvelopeError,
  type ContentConfigurationResponse,
  type MessagePayloadMap,
  type MessageType,
  type NoPayloadMessageType,
  type PayloadMessageType,
  type ResponseMessage,
} from "../domain/messages";
import { hasReadinessError } from "../domain/readinessState";
import { MAX_COMPUTED_STYLE_VALUE_LENGTH } from "../domain/styleValue";
import { validatePayload } from "../domain/validation";
import { isCapturableUrl } from "../infrastructure/browser/browserAdapter";
import { sha256Digest, sha256Hex } from "../infrastructure/checksum";
import { collectElements } from "./collectors/element";
import {
  collectCaptureEnvironment,
  collectCaptureState,
  collectDocumentMetrics,
  collectPageEvidence,
  collectRuntimeEnvironment,
  collectViewport,
} from "./collectors/page";
import { createCaptureMeasurementContext } from "./measurements/context";
import { observeCaptureReadiness } from "./readiness/captureReadiness";
import { prepareFullDocumentImages } from "./readiness/lazyLoadPreparation";
import { selectElements } from "./selectors/selectElements";

const CHUNK_SIZE = 400_000;
const MESSAGE_TIMEOUT_MS = 20_000;
const COMPLETE_TIMEOUT_MS = 60_000;

void run();

async function run(): Promise<void> {
  const capturable = isCapturableUrl(location.href);
  if (!capturable.ok) return;
  const configResponse = await sendRequest<ContentConfigurationResponse>("CONTENT_CONFIG_REQUEST", {
    tabUrl: location.href,
  });
  if (!configResponse.success) return;
  const { jobId, configuration } = configResponse.data;
  try {
    const snapshot = await collectSnapshot(configuration);
    const serialized = canonicalJson(snapshot);
    const serializedBytes = new TextEncoder().encode(serialized);
    if (serializedBytes.length > configuration.maxSnapshotBytes) {
      await sendFailure(jobId, "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT");
      return;
    }
    const snapshotSha256 = await sha256Hex(serializedBytes);
    const totalChunks = countChunks(serialized, CHUNK_SIZE);
    let index = 0;
    for (const data of iterateChunks(serialized, CHUNK_SIZE)) {
      if (location.href !== configurationDocumentUrl()) throw new Error("TAB_NAVIGATED");
      const bytes = new TextEncoder().encode(data);
      const response = await sendRequest<{ accepted: boolean }>("CONTENT_CHUNK", {
        jobId,
        index,
        total: totalChunks,
        data,
        sha256: await sha256Hex(bytes),
        byteLength: bytes.length,
      });
      if (!response.success || !response.data.accepted) throw new Error("Chunk was rejected.");
      index += 1;
    }
    const completed = await sendRequest("CONTENT_COMPLETE", {
      jobId,
      total: totalChunks,
      snapshotSha256,
      byteLength: serializedBytes.length,
    });
    if (!completed.success) throw new Error("Capture completion was rejected.");
  } catch (error: unknown) {
    await sendFailure(jobId, classifyFailure(error));
  }
}

let initialDocumentUrl = location.href;
function configurationDocumentUrl(): string {
  return initialDocumentUrl;
}

async function collectSnapshot(config: CaptureConfiguration): Promise<RuntimeSnapshot> {
  initialDocumentUrl = location.href;
  const preparationDiagnostics: Diagnostic[] = [];
  if (config.prepareFullDocumentImages) {
    try {
      const preparation = await prepareFullDocumentImages();
      preparationDiagnostics.push(
        diagnostic(
          preparation.completed
            ? "EDIS_RUNTIME_LAZY_LOAD_SWEEP_COMPLETED"
            : "EDIS_RUNTIME_LAZY_LOAD_SWEEP_FAILED",
          preparation.completed ? "INFO" : "WARNING",
          "A bounded lazy-load preparation sweep was requested.",
          true,
          { ...preparation },
          "OPERATIONAL",
        ),
      );
    } catch {
      preparationDiagnostics.push(
        diagnostic(
          "EDIS_RUNTIME_LAZY_LOAD_SWEEP_FAILED",
          "WARNING",
          "The bounded lazy-load preparation sweep failed.",
          true,
          {},
          "OPERATIONAL",
        ),
      );
    }
  }
  const readiness = await observeCaptureReadiness(config.readinessHardTimeoutMs);
  if (location.href !== initialDocumentUrl) throw new Error("TAB_NAVIGATED");
  const runtimeEnvironment = collectRuntimeEnvironment();
  const pageBase = await collectPageEvidence(
    config.includePath,
    config.includePageTitle,
    config.redactionMode,
    runtimeEnvironment,
    config.bindingContext,
  );
  const measurementContext = createCaptureMeasurementContext(document);
  const selection = selectElements(
    config.maxElements,
    config.maxDepth,
    config.includeHiddenElements,
    measurementContext,
  );
  await cooperativeYield();
  if (location.href !== initialDocumentUrl) throw new Error("TAB_NAVIGATED");
  const elementResult = await collectElements(
    selection.elements,
    config,
    pageBase.page_context_id,
    measurementContext,
  );
  const page = {
    ...pageBase,
    source_documents_present: elementResult.sourceDocumentsPresent,
  };
  const captureState = await collectCaptureState(readiness, elementResult.metrics.stickyElements);
  const captureEnvironment = collectCaptureEnvironment(readiness);
  const diagnostics: Diagnostic[] = [
    ...preparationDiagnostics,
    ...selection.diagnostics,
    ...elementResult.diagnostics,
  ];
  if (measurementContext.styleValueOmissions.length > 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_STYLE_VALUE_LIMIT_REACHED",
        "WARNING",
        "One or more computed-style values exceeded the bounded collection limit and were omitted.",
        true,
        {
          property_name: measurementContext.styleValueOmissions[0]?.property ?? "unknown",
          limit: MAX_COMPUTED_STYLE_VALUE_LENGTH,
          omitted_value_count: measurementContext.styleValueOmissions.length,
        },
      ),
    );
  }
  if (
    elementResult.measurements.some(
      (item) =>
        item.identity.identity_confidence === "UNMATCHED" ||
        item.identity.identity_status !== "UNIQUE",
    )
  ) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_PARTIAL_IDENTITY",
        "WARNING",
        "Some elements have ambiguous or unmatched runtime references.",
        true,
      ),
    );
  }
  if (hasReadinessError(readiness)) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_READINESS_ERROR",
        "ERROR",
        "Capture readiness failed and the collected evidence is incomplete.",
        true,
      ),
    );
  } else if (readiness.process_state === "TIMEOUT") {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_READINESS_TIMEOUT",
        "WARNING",
        "Capture readiness reached its bounded timeout.",
        true,
        { hard_timeout_ms: readiness.hard_timeout_ms },
      ),
    );
  } else if (readiness.process_state === "UNSTABLE") {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_READINESS_UNSTABLE",
        "WARNING",
        "The document changed during the bounded readiness interval.",
        true,
        {
          incomplete_image_count_total: readiness.incomplete_image_count_total,
          incomplete_image_count_in_viewport: readiness.incomplete_image_count_in_viewport,
          active_animation_count: readiness.active_animation_count,
          document_width_changed:
            readiness.initial_document_width !== readiness.final_document_width,
          document_height_changed:
            readiness.initial_document_height !== readiness.final_document_height,
          viewport_width_changed:
            readiness.initial_viewport_width !== readiness.final_viewport_width,
          viewport_height_changed:
            readiness.initial_viewport_height !== readiness.final_viewport_height,
          sample_count: readiness.sample_count,
          settle_duration_ms: readiness.settle_duration_ms,
        },
      ),
    );
  }
  const reasons = [
    ...new Set(diagnostics.filter((item) => item.scope === "SEMANTIC").map((item) => item.code)),
  ].sort();
  const completenessStatus = reasons.length > 0 ? "PARTIAL" : "COMPLETE";
  const runtimeStructureSha256 = await sha256Digest(
    canonicalJsonWithoutFinalNewline(
      elementResult.measurements.map((item) => ({
        node_id: item.node_id,
        reference_sha256: item.identity.reference_sha256,
        parent_node_id: item.relationships.nearest_emitted_parent_node_id,
        source_element_key: item.source_binding.source_element_key,
      })),
    ),
  );
  return {
    schema_version: SCHEMA_VERSION,
    artifact_type: "runtime_snapshot",
    status: completenessStatus === "COMPLETE" ? "AVAILABLE" : "PARTIAL",
    source: { collector_id: COLLECTOR_ID, collector_version: COLLECTOR_VERSION },
    captured_at: config.capturedAt,
    snapshot_id: config.snapshotId,
    session_id: config.sessionId,
    observation_index: config.observationIndex,
    capture_intent: config.captureIntent,
    capture_configuration: {
      capture_profile: config.captureProfile,
      max_elements: config.maxElements,
      max_depth: config.maxDepth,
      max_snapshot_bytes: config.maxSnapshotBytes,
      include_hidden_elements: config.includeHiddenElements,
      include_colors: config.includeColors,
      include_text_shape: config.includeTextShape,
      include_interaction_facts: config.includeInteractionFacts,
      include_relationship_graph: config.includeRelationshipGraph,
      include_text_preview: config.includeTextPreview,
      text_preview_limit: config.maxTextPreviewChars,
      readiness_hard_timeout_ms: config.readinessHardTimeoutMs,
    },
    evidence_source: "PUBLISHED_FRONTEND",
    runtime_environment: runtimeEnvironment,
    source_context_reference: config.bindingContext?.reference ?? null,
    page,
    viewport: collectViewport(config.userLabel, config.evidenceLabel, config.requestedProfileId),
    document_metrics: collectDocumentMetrics(
      selection.scannedNodes,
      selection.maximumDepth,
      elementResult.measurements.length,
      selection.truncatedBranchCount,
      selection.metrics,
      elementResult.metrics,
      selection.skippedHiddenSubtreeCount,
      selection.skippedHiddenDirectChildCount,
    ),
    capture_readiness: readiness,
    capture_state: captureState,
    capture_environment: captureEnvironment,
    capture_completeness: {
      status: completenessStatus,
      reasons,
      capture_profile: config.captureProfile,
      elements_visited: selection.visitedElements,
      elements_emitted: elementResult.measurements.length,
      maximum_depth_observed: selection.maximumDepth,
      truncated_branch_count: selection.truncatedBranchCount,
      element_budget: selection.elementBudget,
      element_budget_used: elementResult.measurements.length,
      scan_budget: selection.scanBudget,
      scan_budget_used: selection.scannedNodes,
      identity_collision_count: elementResult.identityCollisionCount,
      skipped_hidden_subtree_count: selection.skippedHiddenSubtreeCount,
      skipped_hidden_direct_child_count: selection.skippedHiddenDirectChildCount,
    },
    runtime_structure_sha256: runtimeStructureSha256,
    runtime_regions: elementResult.runtimeRegions,
    page_structure_summary: elementResult.pageStructureSummary,
    document_instances: elementResult.documentInstances,
    source_runtime_cardinality: elementResult.sourceRuntimeCardinality,
    elements: elementResult.measurements,
    privacy: {
      redaction_mode: config.redactionMode,
      screenshot_requested: config.includeScreenshot,
      url_path_included: config.includePath,
      locator_facts_included: config.includePath,
      locator_path_disclosure: config.includePath ? "RAW" : "HASH_ONLY",
      page_title_included: config.includePageTitle,
      color_styles_included: config.includeColors,
      text_preview_requested: config.includeTextPreview,
      text_preview_limit: config.maxTextPreviewChars,
    },
    diagnostics,
  };
}

function sendRequest<T>(
  type: NoPayloadMessageType,
  payload?: undefined,
): Promise<ResponseMessage<T>>;
function sendRequest<T, M extends PayloadMessageType = PayloadMessageType>(
  type: M,
  payload: MessagePayloadMap[M],
): Promise<ResponseMessage<T>>;
async function sendRequest<T>(type: MessageType, payload?: unknown): Promise<ResponseMessage<T>> {
  if (!validatePayload(type, payload)) throw new Error(`Invalid ${type} request payload.`);
  const message =
    payload === undefined
      ? makeMessage(type as NoPayloadMessageType)
      : makeMessage(type as PayloadMessageType, payload as never);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("MESSAGE_TIMEOUT")),
        type === "CONTENT_COMPLETE" ? COMPLETE_TIMEOUT_MS : MESSAGE_TIMEOUT_MS,
      );
    });
    const response = await Promise.race([
      chrome.runtime.sendMessage(message) as Promise<ResponseMessage<T>>,
      timeout,
    ]);
    return validateResponseEnvelope<T>(response, message.requestId);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

function* iterateChunks(value: string, maximumLength: number): Generator<string> {
  if (value.length === 0) {
    yield "";
    return;
  }
  let index = 0;
  while (index < value.length) {
    const end = nextChunkEnd(value, index, maximumLength);
    yield value.slice(index, end);
    index = end;
  }
}

function countChunks(value: string, maximumLength: number): number {
  if (value.length === 0) return 1;
  let count = 0;
  let index = 0;
  while (index < value.length) {
    index = nextChunkEnd(value, index, maximumLength);
    count += 1;
  }
  return count;
}

function nextChunkEnd(value: string, index: number, maximumLength: number): number {
  let end = Math.min(value.length, index + maximumLength);
  if (end < value.length) {
    const previous = value.charCodeAt(end - 1);
    const next = value.charCodeAt(end);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;
  }
  return end > index ? end : Math.min(value.length, index + maximumLength);
}

function cooperativeYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function")
      requestIdleCallback(() => resolve(), { timeout: 50 });
    else setTimeout(resolve, 0);
  });
}
function classifyFailure(error: unknown): string {
  if (error instanceof Error && error.message === "TAB_NAVIGATED")
    return "EDIS_RUNTIME_TAB_NAVIGATED";
  if (error instanceof Error && error.message === "MESSAGE_TIMEOUT")
    return "EDIS_RUNTIME_WORKER_INTERRUPTED";
  if (error instanceof ResponseEnvelopeError) return error.code;
  return "EDIS_RUNTIME_SERIALIZATION_FAILED";
}
async function sendFailure(jobId: string, code: string): Promise<void> {
  try {
    await sendRequest("CONTENT_FAILED", { jobId, code });
  } catch {
    /* Worker may already be unavailable. */
  }
}
