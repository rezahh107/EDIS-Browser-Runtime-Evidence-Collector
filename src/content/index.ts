import { canonicalJson } from "../domain/canonical";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import {
  COLLECTOR_ID,
  SCHEMA_VERSION,
  type CaptureConfiguration,
  type RuntimeSnapshot,
} from "../domain/model";
import {
  failure,
  makeMessage,
  type ContentConfigurationResponse,
  type ResponseMessage,
} from "../domain/messages";
import { isCapturableUrl } from "../infrastructure/browser/browserAdapter";
import { collectElements } from "./collectors/element";
import { collectDocumentMetrics, collectPageEvidence, collectViewport } from "./collectors/page";
import { selectElements } from "./selectors/selectElements";

const CHUNK_SIZE = 400_000;

void run();

async function run(): Promise<void> {
  const capturable = isCapturableUrl(location.href);
  if (!capturable.ok) return;
  const configResponse = (await chrome.runtime.sendMessage(
    makeMessage("CONTENT_CONFIG_REQUEST", { tabUrl: location.href }),
  )) as ResponseMessage<ContentConfigurationResponse>;
  if (!configResponse.success) return;
  const { jobId, configuration } = configResponse.data;
  try {
    const snapshot = await collectSnapshot(configuration);
    const serialized = canonicalJson(snapshot);
    if (new TextEncoder().encode(serialized).length > configuration.maxSnapshotBytes) {
      await sendFailure(jobId, "EDIS_RUNTIME_SNAPSHOT_SIZE_LIMIT");
      return;
    }
    const chunks = splitChunks(serialized, CHUNK_SIZE);
    for (let index = 0; index < chunks.length; index += 1) {
      const status = (await chrome.runtime.sendMessage(
        makeMessage("CONTENT_JOB_STATUS", { jobId }),
      )) as ResponseMessage<{ active: boolean }>;
      if (!status.success || !status.data.active) {
        await sendFailure(jobId, "EDIS_RUNTIME_CAPTURE_CANCELLED");
        return;
      }
      const response = (await chrome.runtime.sendMessage(
        makeMessage("CONTENT_CHUNK", { jobId, index, total: chunks.length, data: chunks[index] }),
      )) as ResponseMessage<{ accepted: boolean }>;
      if (!response.success) throw new Error("Chunk was rejected.");
    }
    await chrome.runtime.sendMessage(
      makeMessage("CONTENT_COMPLETE", { jobId, total: chunks.length }),
    );
  } catch (error: unknown) {
    await sendFailure(jobId, classifyFailure(error));
  }
}

async function collectSnapshot(config: CaptureConfiguration): Promise<RuntimeSnapshot> {
  const startedUrl = location.href;
  const selection = selectElements(
    config.maxElements,
    config.maxDepth,
    config.includeHiddenElements,
  );
  await cooperativeYield();
  if (location.href !== startedUrl) throw new Error("TAB_NAVIGATED");
  const elementResult = collectElements(selection.elements, config);
  const diagnostics: Diagnostic[] = [...selection.diagnostics, ...elementResult.diagnostics];
  if (
    elementResult.measurements.some(
      (item) =>
        item.identity.identity_confidence === "WEAK" ||
        item.identity.identity_confidence === "UNMATCHED",
    )
  ) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_PARTIAL_IDENTITY",
        "WARNING",
        "Some elements have lower-confidence stable references.",
        true,
      ),
    );
  }
  const capturedAt = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    artifact_type: "runtime_snapshot",
    status: diagnostics.length > 0 ? "PARTIAL" : "AVAILABLE",
    source: { collector_id: COLLECTOR_ID, collector_version: "1.0.0" },
    captured_at: capturedAt,
    data: {
      snapshot_id: config.snapshotId,
      session_id: config.sessionId,
      evidence_source: "PUBLISHED_FRONTEND",
      page: collectPageEvidence(config.includePath, config.includePageTitle),
      viewport: collectViewport(
        config.userLabel,
        config.evidenceLabel,
        config.officialBreakpointId,
      ),
      document_metrics: collectDocumentMetrics(selection.scannedNodes, selection.maximumDepth),
      elements: elementResult.measurements,
      privacy: {
        redaction_mode: config.redactionMode,
        text_preview_included: config.includeTextPreview,
        screenshot_requested: config.includeScreenshot,
        url_path_included: config.includePath,
        page_title_included: config.includePageTitle,
        color_styles_included: config.includeColors,
      },
    },
    diagnostics,
  };
}

function splitChunks(value: string, maximumLength: number): readonly string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += maximumLength)
    chunks.push(value.slice(index, index + maximumLength));
  return chunks.length > 0 ? chunks : [""];
}

function cooperativeYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function")
      requestIdleCallback(() => resolve(), { timeout: 50 });
    else setTimeout(resolve, 0);
  });
}

function classifyFailure(error: unknown): string {
  return error instanceof Error && error.message === "TAB_NAVIGATED"
    ? "EDIS_RUNTIME_TAB_NAVIGATED"
    : "EDIS_RUNTIME_SERIALIZATION_FAILED";
}

async function sendFailure(jobId: string, code: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage(makeMessage("CONTENT_FAILED", { jobId, code }));
  } catch {
    void failure(crypto.randomUUID(), code, "The content collector could not report its failure.");
  }
}
