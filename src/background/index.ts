import { routeMessage } from "./messageRouter";
import { CaptureCoordinator } from "./captureCoordinator";

const coordinator = new CaptureCoordinator();

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void routeMessage(message, sender)
    .then(sendResponse)
    .catch(() => {
      sendResponse({
        requestId: crypto.randomUUID(),
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
  if (changeInfo.status === "loading") void coordinator.handleNavigation(tabId);
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
