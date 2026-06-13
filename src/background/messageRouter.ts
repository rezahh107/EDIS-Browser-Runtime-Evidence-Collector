import { diagnostic } from "../domain/diagnostics";
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
  type ResponseMessage,
  type SessionCreatePayload,
  type SessionSelectPayload,
} from "../domain/messages";
import { isBaseMessage, isRecord, validatePayload } from "../domain/validation";
import { createSession, currentSessionId, selectSession } from "../application/sessionUseCases";
import { ChromeBrowserAdapter } from "../infrastructure/browser/chromeAdapter";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import {
  clearPreferences,
  loadPreferences,
  savePreferences,
} from "../infrastructure/storage/preferences";
import { CaptureCoordinator, CoordinatorError } from "./captureCoordinator";

const coordinator = new CaptureCoordinator();
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
      case "STATE_GET": {
        const sessions = [...(await repository.listSessions())].sort((a, b) =>
          b.data.created_at.localeCompare(a.data.created_at),
        );
        return success(raw.requestId, {
          currentSessionId: await currentSessionId(),
          sessions,
          storageUsage: await repository.estimateUsage(),
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
        await chrome.storage.session.clear();
        return success(raw.requestId, { cleared: true });
      case "EXPORT_COMPLETE": {
        const payload = raw.payload as ExportCompletePayload;
        return success(raw.requestId, { sessionId: payload.sessionId, acknowledged: true });
      }
      case "CONTENT_CONFIG_REQUEST": {
        const tabId = requiredTabId(sender);
        const payload = raw.payload as ContentConfigRequestPayload;
        const configuration = await coordinator.configurationForTab(tabId, payload.tabUrl);
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
        await coordinator.acceptChunk(requiredTabId(sender), payload);
        return success(raw.requestId, { accepted: true });
      }
      case "CONTENT_COMPLETE": {
        const payload = raw.payload as ContentCompletePayload;
        return success(
          raw.requestId,
          await coordinator.complete(requiredTabId(sender), payload.jobId, payload.total),
        );
      }
      case "CONTENT_FAILED": {
        const payload = raw.payload as ContentFailedPayload;
        await coordinator.failFromContent(requiredTabId(sender), payload.jobId, payload.code);
        return success(raw.requestId, { recorded: true });
      }
      case "CONTENT_JOB_STATUS": {
        const payload = raw.payload as CaptureCancelPayload;
        return success(raw.requestId, {
          active: await coordinator.isActive(payload.jobId, requiredTabId(sender)),
        });
      }
    }
  } catch (error: unknown) {
    if (error instanceof CoordinatorError)
      return failure(raw.requestId, error.diagnostic.code, error.diagnostic.message);
    if (isQuotaError(error)) {
      const item = diagnostic(
        "EDIS_RUNTIME_STORAGE_QUOTA_EXCEEDED",
        "ERROR",
        "Extension storage quota was exceeded.",
        true,
      );
      return failure(raw.requestId, item.code, item.message);
    }
    return failure(raw.requestId, "EDIS_RUNTIME_SERIALIZATION_FAILED", safeErrorMessage(error));
  }
}

export function validSender(message: BaseMessage, sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const isContent = CONTENT_TYPES.has(message.type);
  if (isContent)
    return sender.tab?.id !== undefined && isHttpUrl(sender.url ?? sender.tab.url ?? "");
  if (sender.tab?.id !== undefined) return false;
  if (!sender.url) return true;
  try {
    return new URL(sender.url).origin === new URL(chrome.runtime.getURL("/")).origin;
  } catch {
    return false;
  }
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
  return isRecord(value) && typeof value.requestId === "string"
    ? value.requestId
    : crypto.randomUUID();
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
