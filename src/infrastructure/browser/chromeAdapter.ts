import { diagnostic } from "../../domain/diagnostics";
import { err, ok, type Result } from "../../domain/result";
import { isCapturableUrl, type ActiveTab, type BrowserAdapter } from "./browserAdapter";

export class ChromeBrowserAdapter implements BrowserAdapter {
  async getActiveTab(): Promise<Result<ActiveTab, ReturnType<typeof diagnostic>>> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id === undefined || tab.windowId === undefined || typeof tab.url !== "string") {
        return err(
          diagnostic(
            "EDIS_RUNTIME_PERMISSION_DENIED",
            "ERROR",
            "The active page is not available to the extension.",
            true,
          ),
        );
      }
      const capturable = isCapturableUrl(tab.url);
      if (!capturable.ok) return capturable;
      return ok({ id: tab.id, windowId: tab.windowId, url: tab.url });
    } catch {
      return err(
        diagnostic(
          "EDIS_RUNTIME_PERMISSION_DENIED",
          "ERROR",
          "Temporary page access was not granted.",
          true,
        ),
      );
    }
  }

  async injectCollector(tabId: number): Promise<Result<void, ReturnType<typeof diagnostic>>> {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content/index.js"] });
      return ok(undefined);
    } catch {
      return err(
        diagnostic(
          "EDIS_RUNTIME_PERMISSION_DENIED",
          "ERROR",
          "The page collector could not be injected.",
          true,
        ),
      );
    }
  }

  async captureVisibleViewport(
    windowId: number,
  ): Promise<Result<string, ReturnType<typeof diagnostic>>> {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      if (!dataUrl.startsWith("data:image/png;base64,"))
        throw new Error("Unexpected screenshot format.");
      return ok(dataUrl);
    } catch {
      return err(
        diagnostic(
          "EDIS_RUNTIME_SCREENSHOT_FAILED",
          "WARNING",
          "The visible viewport screenshot could not be captured.",
          true,
        ),
      );
    }
  }

  async openWorkflow(tabId: number): Promise<Result<void, ReturnType<typeof diagnostic>>> {
    try {
      const sidePanel = chrome.sidePanel as typeof chrome.sidePanel | undefined;
      if (sidePanel?.open) {
        await sidePanel.open({ tabId });
      } else {
        await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/index.html") });
      }
      return ok(undefined);
    } catch {
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel/index.html") });
        return ok(undefined);
      } catch {
        return err(
          diagnostic(
            "EDIS_RUNTIME_UNSUPPORTED_PAGE",
            "ERROR",
            "The workflow page could not be opened.",
            true,
          ),
        );
      }
    }
  }

  getVersion(): string {
    return chrome.runtime.getManifest().version;
  }
}
