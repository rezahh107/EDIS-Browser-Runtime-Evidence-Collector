import { diagnostic, diagnosticDisplayMessage } from "../domain/diagnostics";
import { NIL_REQUEST_ID } from "../domain/identifiers";
import {
  failure,
  success,
  type BaseMessage,
  type CaptureCancelPayload,
  type CaptureStartPayload,
  type ContentChunkPayload,
  type ContentCompletePayload,
  type ContentConfigRequestPayload,
  type ContentFailedPayload,
  type ExportCompletePayload,
  type OptionsSavePayload,
  type PythonFeedCaptureCheckPayload,
  type SourceContextImportPayload,
  type SourceContextSelectDocumentPayload,
  type ResponseMessage,
  type SessionCreatePayload,
  type SessionSelectPayload,
} from "../domain/messages";
import { isBaseMessage, isRecord, isRequestId, validatePayload } from "../domain/validation";
import {
  createSession,
  currentSessionId,
  selectSession,
  synchronizeEmptyCurrentSessionSourceContext,
} from "../application/sessionUseCases";
import { bindingContextFromRecord } from "../domain/bridge";
import { ChromeBrowserAdapter } from "../infrastructure/browser/chromeAdapter";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import {
  clearPreferences,
  loadPreferences,
  savePreferences,
} from "../infrastructure/storage/preferences";
import {
  clearSourceContext,
  importSourceContext,
  loadSourceContextRecord,
} from "../infrastructure/storage/sourceContext";
import { CaptureCoordinator, CoordinatorError } from "./captureCoordinator";

export const coordinator = new CaptureCoordinator();
const repository = new EvidenceRepository();
const browser = new ChromeBrowserAdapter();
const CONTENT_TYPES = new Set([
  "CONTENT_CONFIG_REQUEST",
  "CONTENT_CHUNK",
  "CONTENT_COMPLETE",
  "CONTENT_FAILED",
  "CONTENT_JOB_STATUS",
]);

export async function routeMessage(
  raw: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMessage<unknown>> {
  if (!isBaseMessage(raw))
    return failure(
      requestIdFrom(raw),
      "EDIS_RUNTIME_MESSAGE_REJECTED",
      "Invalid message envelope.",
    );
  if (!validatePayload(raw.type, raw.payload))
    return failure(raw.requestId, "EDIS_RUNTIME_MESSAGE_REJECTED", "Invalid message payload.");
  if (!validSender(raw, sender))
    return failure(raw.requestId, "EDIS_RUNTIME_MESSAGE_REJECTED", "Message sender was rejected.");
  try {
    switch (raw.type) {
      case "PAGE_CHECK": {
        const active = await browser.getActiveTab();
        return active.ok
          ? success(raw.requestId, { capturable: true, tab: active.value })
          : success(raw.requestId, { capturable: false, diagnostic: active.error });
      }
      case "PAGE_PROBE":
        return success(raw.requestId, await coordinator.probeCurrentPage());
      case "PYTHON_FEED_CAPTURE_CHECK": {
        const payload = raw.payload as PythonFeedCaptureCheckPayload;
        return success(
          raw.requestId,
          await coordinator.checkPythonFeedCapture(payload.sessionId, payload.requestedProfileId),
        );
      }
      case "STATE_GET": {
        const selectedSessionId = await currentSessionId();
        const [projection, selectedSession, storageUsage] = await Promise.all([
          repository.listSessionSummaryProjection(),
          selectedSessionId ? repository.getSession(selectedSessionId) : undefined,
          repository.estimateUsage(),
        ]);
        return success(raw.requestId, {
          currentSessionId: selectedSessionId,
          currentSession: selectedSession ?? null,
          sessions: projection.summaries,
          storageUsage,
          storageDiagnostics: projection.diagnostics,
          corruptStoredSessionCount: projection.corruptRecordCount,
        });
      }
      case "SESSION_CREATE": {
        const payload = raw.payload as SessionCreatePayload;
        const session = await createSession(payload.name);
        return success(raw.requestId, session);
      }
      case "SESSION_SELECT": {
        const payload = raw.payload as SessionSelectPayload;
        return success(raw.requestId, await selectSession(payload.sessionId));
      }
      case "CAPTURE_START": {
        return success(
          raw.requestId,
          await coordinator.start(raw.payload as CaptureStartPayload, raw.requestId),
        );
      }
      case "CAPTURE_CANCEL": {
        const payload = raw.payload as CaptureCancelPayload;
        return success(raw.requestId, await coordinator.cancel(payload.jobId));
      }
      case "CAPTURE_STATUS": {
        const payload = raw.payload as CaptureCancelPayload;
        return success(raw.requestId, await coordinator.status(payload.jobId));
      }
      case "OPEN_SIDE_PANEL": {
        const active = await browser.getActiveTab();
        if (!active.ok) throw new CoordinatorError(active.error);
        const opened = await browser.openWorkflow(active.value.id);
        if (!opened.ok) throw new CoordinatorError(opened.error);
        return success(raw.requestId, { opened: true });
      }
      case "OPTIONS_GET":
        return success(raw.requestId, await loadPreferences());
      case "OPTIONS_SAVE": {
        const payload = raw.payload as OptionsSavePayload;
        await savePreferences(payload.preferences);
        return success(raw.requestId, payload.preferences);
      }
      case "CLEAR_ALL_DATA":
        await repository.clearAll();
        await clearPreferences();
        await clearSourceContext();
        await chrome.storage.session.clear();
        return success(raw.requestId, { cleared: true });
      case "SOURCE_CONTEXT_IMPORT": {
        const payload = raw.payload as SourceContextImportPayload;
        const record = await importSourceContext(payload.text, payload.selectedDocumentId);
        const attachedToCurrentSession = await synchronizeEmptyCurrentSessionSourceContext(
          bindingContextFromRecord(record).reference,
        );
        return success(raw.requestId, {
          imported: true,
          importedAt: record.imported_at,
          selectedDocumentId: record.selected_document_id,
          documentCount: record.context.data.documents.length,
          wordpressBundleId: record.context.data.wordpress_bundle_id,
          sourceExportRootSha256: record.context.data.source_export_root_sha256,
          attachedToCurrentSession,
        });
      }
      case "SOURCE_CONTEXT_GET": {
        const record = await loadSourceContextRecord();
        return success(
          raw.requestId,
          record
            ? {
                imported: true,
                importedAt: record.imported_at,
                selectedDocumentId: record.selected_document_id,
                documents: record.context.data.documents.map((item) => ({
                  documentId: item.document_id,
                  documentType: item.document_type,
                  elementCount: item.elements.length,
                })),
                wordpressBundleId: record.context.data.wordpress_bundle_id,
                sourceExportRootSha256: record.context.data.source_export_root_sha256,
              }
            : { imported: false },
        );
      }
      case "SOURCE_CONTEXT_CLEAR":
        await clearSourceContext();
        await synchronizeEmptyCurrentSessionSourceContext(null);
        return success(raw.requestId, { cleared: true });
      case "SOURCE_CONTEXT_SELECT_DOCUMENT": {
        const payload = raw.payload as SourceContextSelectDocumentPayload;
        const record = await loadSourceContextRecord();
        if (!record) throw new Error("Source Context has not been imported.");
        if (
          payload.documentId !== null &&
          !record.context.data.documents.some((item) => item.document_id === payload.documentId)
        )
          throw new Error("Selected source document was not found.");
        const updatedRecord = {
          ...record,
          selected_document_id: payload.documentId,
          confirmation_state:
            payload.documentId === null ? ("NOT_CONFIRMED" as const) : ("CONFIRMED" as const),
        };
        await chrome.storage.local.set({ importedSourceContextV1: updatedRecord });
        const attachedToCurrentSession = await synchronizeEmptyCurrentSessionSourceContext(
          bindingContextFromRecord(updatedRecord).reference,
        );
        return success(raw.requestId, {
          selectedDocumentId: payload.documentId,
          attachedToCurrentSession,
        });
      }
      case "EXPORT_COMPLETE": {
        const payload = raw.payload as ExportCompletePayload;
        return success(raw.requestId, { sessionId: payload.sessionId, acknowledged: true });
      }
      case "CONTENT_CONFIG_REQUEST": {
        const tabId = requiredTabId(sender);
        const payload = raw.payload as ContentConfigRequestPayload;
        const senderUrl = sender.url ?? sender.tab?.url ?? "";
        const configuration = await coordinator.configurationForTab(
          tabId,
          payload.tabUrl,
          senderUrl,
          sender.documentId ?? null,
        );
        return configuration
          ? success(raw.requestId, configuration)
          : failure(
              raw.requestId,
              "EDIS_RUNTIME_MESSAGE_REJECTED",
              "No active capture job exists for this tab.",
            );
      }
      case "CONTENT_CHUNK": {
        const payload = raw.payload as ContentChunkPayload;
        await coordinator.acceptChunk(
          requiredTabId(sender),
          requiredSenderUrl(sender),
          sender.documentId ?? null,
          payload,
        );
        return success(raw.requestId, { accepted: true });
      }
      case "CONTENT_COMPLETE": {
        const payload = raw.payload as ContentCompletePayload;
        return success(
          raw.requestId,
          await coordinator.complete(
            requiredTabId(sender),
            requiredSenderUrl(sender),
            sender.documentId ?? null,
            payload,
          ),
        );
      }
      case "CONTENT_FAILED": {
        const payload = raw.payload as ContentFailedPayload;
        await coordinator.failFromContent(
          requiredTabId(sender),
          requiredSenderUrl(sender),
          sender.documentId ?? null,
          payload.jobId,
          payload.code,
        );
        return success(raw.requestId, { recorded: true });
      }
      case "CONTENT_JOB_STATUS": {
        const payload = raw.payload as CaptureCancelPayload;
        return success(raw.requestId, {
          active: await coordinator.isActive(
            payload.jobId,
            requiredTabId(sender),
            requiredSenderUrl(sender),
            sender.documentId ?? null,
          ),
        });
      }
    }
  } catch (error: unknown) {
    if (error instanceof CoordinatorError)
      return failure(
        raw.requestId,
        error.diagnostic.code,
        diagnosticDisplayMessage(error.diagnostic),
      );
    if (isQuotaError(error)) {
      const item = diagnostic(
        "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
        "ERROR",
        "Extension storage quota was exceeded.",
        true,
      );
      return failure(raw.requestId, item.code, diagnosticDisplayMessage(item));
    }
    return failure(raw.requestId, "EDIS_RUNTIME_SERIALIZATION_FAILED", safeErrorMessage(error));
  }
}

export function validSender(message: BaseMessage, sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const isContent = CONTENT_TYPES.has(message.type);
  if (isContent) {
    const senderUrl = sender.url ?? sender.tab?.url ?? "";
    if (
      sender.tab?.id === undefined ||
      (sender.frameId !== undefined && sender.frameId !== 0) ||
      !isHttpUrl(senderUrl)
    )
      return false;
    if (sender.origin !== undefined) {
      try {
        if (sender.origin !== new URL(senderUrl).origin) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;
  for (const candidate of [sender.url, sender.origin]) {
    if (!candidate) continue;
    try {
      if (new URL(candidate).origin === extensionOrigin) return true;
    } catch {
      // Ignore malformed sender metadata and continue to the next trusted field.
    }
  }
  return false;
}

function requiredTabId(sender: chrome.runtime.MessageSender): number {
  if (sender.tab?.id === undefined) throw new Error("Sender tab is unavailable.");
  return sender.tab.id;
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function requestIdFrom(value: unknown): string {
  return isRecord(value) && isRequestId(value.requestId) ? value.requestId : NIL_REQUEST_ID;
}

function requiredSenderUrl(sender: chrome.runtime.MessageSender): string {
  const value = sender.url ?? sender.tab?.url;
  if (!value || !isHttpUrl(value)) throw new Error("Sender document URL is unavailable.");
  return value;
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && /not found|does not exist|invalid|unsupported/i.test(error.message))
    return error.message.slice(0, 200);
  return "The requested operation failed safely.";
}
