import { diagnostic } from "../../domain/diagnostics";
import {
  VIEWPORT_IMAGE_READINESS_POLICY_ID,
  VIEWPORT_IMAGE_READINESS_POLICY_VERSION,
  VIEWPORT_IMAGE_READINESS_TIMEOUT_MS,
} from "../../domain/capturePolicy";
import { err, ok, type Result } from "../../domain/result";
import {
  isCapturableUrl,
  type ActiveTab,
  type BrowserAdapter,
  type RawPageProbe,
} from "./browserAdapter";

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
            {},
            "OPERATIONAL",
            "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
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
          {},
          "OPERATIONAL",
          "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
        ),
      );
    }
  }

  async probePage(tabId: number): Promise<Result<RawPageProbe, ReturnType<typeof diagnostic>>> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [
          VIEWPORT_IMAGE_READINESS_TIMEOUT_MS,
          VIEWPORT_IMAGE_READINESS_POLICY_ID,
          VIEWPORT_IMAGE_READINESS_POLICY_VERSION,
        ],
        func: async (timeoutMs: number, timeoutPolicyId: string, timeoutPolicyVersion: number) => {
          const started = performance.now();
          const intersectsViewport = (element: Element): boolean => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const opacity = Number.parseFloat(style.opacity || "1");
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.visibility !== "collapse" &&
              (Number.isNaN(opacity) || opacity > 0) &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.right > 0 &&
              rect.top < window.innerHeight &&
              rect.left < window.innerWidth
            );
          };
          const images = [...document.images].filter((image) => intersectsViewport(image));
          const decodeFailed = new Set<HTMLImageElement>();
          const pending = images.filter((image) => !(image.complete && image.naturalWidth > 0));
          let timedOut = false;
          if (pending.length > 0 && timeoutMs > 0) {
            const decodeTasks = pending.map(async (image) => {
              try {
                await image.decode();
              } catch {
                decodeFailed.add(image);
              }
            });
            await Promise.race([
              Promise.allSettled(decodeTasks),
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  timedOut = true;
                  resolve();
                }, timeoutMs),
              ),
            ]);
          }
          let loadedCount = 0;
          let brokenCount = 0;
          let pendingCount = 0;
          let decodeFailedCount = 0;
          let timedOutCount = 0;
          for (const image of images) {
            if (image.complete && image.naturalWidth > 0) loadedCount += 1;
            else if (image.complete && image.naturalWidth === 0) brokenCount += 1;
            else if (decodeFailed.has(image)) decodeFailedCount += 1;
            else if (timedOut) timedOutCount += 1;
            else pendingCount += 1;
          }

          const body = document.body;
          const adminBar = document.getElementById("wpadminbar");
          const adminStyle = adminBar ? getComputedStyle(adminBar) : null;
          const adminRect = adminBar?.getBoundingClientRect() ?? null;
          const htmlStyle = getComputedStyle(document.documentElement);
          const bodyStyle = body ? getComputedStyle(body) : null;
          const bodyAdminBarClass = body?.classList.contains("admin-bar") ?? false;
          const wpadminbarElementPresent = adminBar !== null;
          const visibleAdminBar = Boolean(
            adminBar &&
            adminStyle &&
            adminStyle.display !== "none" &&
            adminStyle.visibility !== "hidden" &&
            adminStyle.visibility !== "collapse" &&
            adminRect &&
            adminRect.height > 0,
          );
          const parseMargin = (value: string | null): number => {
            if (value === null) return 0;
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
          const geometryAffected =
            Math.abs(parseMargin(htmlStyle.marginTop)) > 0.5 ||
            Math.abs(parseMargin(bodyStyle?.marginTop ?? null)) > 0.5;
          const adminDetectionState =
            visibleAdminBar || geometryAffected
              ? "PRESENT"
              : bodyAdminBarClass || wpadminbarElementPresent
                ? "AMBIGUOUS"
                : "ABSENT";

          const documentWithPrerender = document as Document & { readonly prerendering?: boolean };
          return {
            url: location.href,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            pageMarkerPresent:
              document.documentElement.classList.contains("elementor-html") ||
              (body?.classList.contains("elementor-page") ?? false) ||
              document.querySelector("[data-elementor-id]") !== null,
            rawDataElementorIds: [...document.querySelectorAll("[data-elementor-id]")]
              .slice(0, 500)
              .map((element) => element.getAttribute("data-elementor-id") ?? ""),
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            documentVisibilityState: document.visibilityState,
            documentPrerendering: documentWithPrerender.prerendering === true,
            adminBar: {
              bodyAdminBarClass,
              wpadminbarElementPresent,
              wpadminbarComputedDisplay: adminStyle?.display ?? null,
              wpadminbarComputedVisibility: adminStyle?.visibility ?? null,
              wpadminbarRectHeight: adminRect?.height ?? null,
              htmlComputedMarginTop: htmlStyle.marginTop,
              bodyComputedMarginTop: bodyStyle?.marginTop ?? null,
              detectionState: adminDetectionState,
            },
            elementorEditorPreviewPresent:
              document.documentElement.classList.contains("elementor-html") &&
              ((body?.classList.contains("elementor-editor-active") ?? false) ||
                document.querySelector(".elementor-editor-active, #elementor-preview") !== null),
            iframeCapture: window.top !== window.self,
            viewportImageReadiness: {
              candidateCount: images.length,
              loadedCount,
              brokenCount,
              pendingCount,
              decodeFailedCount,
              timedOutCount,
              waitTimeMs: Math.max(0, performance.now() - started),
              timeoutMs,
              timeoutPolicyId,
              timeoutPolicyVersion,
            },
          };
        },
      });
      const value = results[0]?.result;
      if (
        !value ||
        typeof value.url !== "string" ||
        !Number.isFinite(value.innerWidth) ||
        !Number.isFinite(value.innerHeight) ||
        typeof value.pageMarkerPresent !== "boolean" ||
        !Array.isArray(value.rawDataElementorIds) ||
        !value.rawDataElementorIds.every((item) => typeof item === "string") ||
        !Number.isFinite(value.scrollX) ||
        !Number.isFinite(value.scrollY) ||
        !["hidden", "visible"].includes(value.documentVisibilityState) ||
        typeof value.documentPrerendering !== "boolean" ||
        !value.adminBar ||
        !["ABSENT", "PRESENT", "AMBIGUOUS"].includes(value.adminBar.detectionState) ||
        typeof value.elementorEditorPreviewPresent !== "boolean" ||
        typeof value.iframeCapture !== "boolean" ||
        !value.viewportImageReadiness
      )
        throw new Error("The active page probe returned invalid evidence.");
      return ok(value as RawPageProbe);
    } catch {
      return err(
        diagnostic(
          "EDIS_RUNTIME_PERMISSION_DENIED",
          "ERROR",
          "The active page could not be measured before capture.",
          true,
          {},
          "OPERATIONAL",
          "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
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
          {},
          "OPERATIONAL",
          "RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE",
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
          {},
          "OPERATIONAL",
          "CONTENT_CAPTURE_FAILURE",
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
            {},
            "OPERATIONAL",
            "BROWSER_QUALIFICATION_FAILURE",
          ),
        );
      }
    }
  }

  getVersion(): string {
    return chrome.runtime.getManifest().version;
  }
}
