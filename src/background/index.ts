import { coordinator, routeMessage } from "./messageRouter";
import { isRecord, isRequestId } from "../domain/validation";
import { NIL_REQUEST_ID } from "../domain/identifiers";

export const SERVICE_WORKER_STARTUP_SEQUENCE_KEY = "edis:service-worker-startup-sequence";

async function recordServiceWorkerStartup(): Promise<void> {
  try {
    const existing = await chrome.storage.session.get(SERVICE_WORKER_STARTUP_SEQUENCE_KEY);
    const current = existing[SERVICE_WORKER_STARTUP_SEQUENCE_KEY];
    const next = typeof current === "number" && Number.isSafeInteger(current) ? current + 1 : 1;
    await chrome.storage.session.set({ [SERVICE_WORKER_STARTUP_SEQUENCE_KEY]: next });
  } catch {
    // Startup sequence evidence is best-effort and must not block listener registration.
  }
}

void recordServiceWorkerStartup();

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void routeMessage(message, sender)
    .then(sendResponse)
    .catch(() => {
      sendResponse({
        requestId:
          isRecord(message) && isRequestId(message.requestId) ? message.requestId : NIL_REQUEST_ID,
        success: false,
        error: {
          code: "EDIS_RUNTIME_SERIALIZATION_FAILED",
          message: "The background operation failed safely.",
        },
      });
    });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || typeof changeInfo.url === "string")
    void coordinator.handleNavigation(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void coordinator.handleNavigation(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void coordinator.recoverInterruptedJobs();
});

chrome.runtime.onStartup.addListener(() => {
  void coordinator.recoverInterruptedJobs();
});

void coordinator.recoverInterruptedJobs();
