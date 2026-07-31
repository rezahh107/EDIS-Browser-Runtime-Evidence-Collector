import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type {
  CaptureJob,
  CaptureSession,
  RuntimeSnapshot,
  ScreenshotRecord,
} from "../../src/domain/model";
import { canonicalJson, canonicalSemanticJson } from "../../src/domain/canonical";
import { PROTOCOL_VERSION } from "../../src/domain/messages";

import {
  chromium,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Request,
  type Worker,
} from "@playwright/test";

export type BrowserTarget = "chrome" | "edge";

export interface HarnessLogs {
  readonly console: string[];
  readonly pageErrors: string[];
  readonly requests: Array<{
    readonly url: string;
    readonly method: string;
    readonly source: string | null;
  }>;
  readonly serviceWorkers: string[];
}

export interface ExtensionHarness {
  readonly context: BrowserContext;
  readonly worker: Worker;
  readonly extensionId: string;
  readonly extensionOrigin: string;
  readonly extensionPath: string;
  readonly executablePath: string;
  readonly logs: HarnessLogs;
  readonly artifacts: string;
  close(name: string): Promise<void>;
}

const execFileAsync = promisify(execFile);
let messageSequence = 0;

export async function launchExtensionHarness(options?: {
  readonly browser?: BrowserTarget;
  readonly locale?: string;
  readonly name?: string;
}): Promise<ExtensionHarness> {
  const browser = options?.browser ?? configuredBrowser();
  const executablePath = await resolveExecutable(browser);
  const extensionPath = path.resolve(
    process.env.EDIS_E2E_EXTENSION_PATH ?? path.join("dist", browser),
  );
  const artifacts = path.resolve(
    process.env.EDIS_E2E_ARTIFACT_DIR ?? "artifacts/browser-e2e",
    options?.name ?? "runtime",
  );
  const profile = path.join(artifacts, "profile");
  await rm(profile, { recursive: true, force: true });
  await mkdir(path.join(profile, "Default"), { recursive: true });
  await writePinnedExtensionPreference(profile, extensionPath);
  const logs: HarnessLogs = { console: [], pageErrors: [], requests: [], serviceWorkers: [] };
  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-component-update",
    "--disable-background-networking",
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    ...(options?.locale ? [`--lang=${options.locale}`] : []),
    ...(process.env.EDIS_E2E_ALLOW_NO_SANDBOX === "true" ? ["--no-sandbox"] : []),
  ];
  const captureMedia = process.env.EDIS_E2E_CAPTURE_MEDIA === "true";
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: configuredHeadless(),
    ignoreDefaultArgs: ["--disable-extensions"],
    args,
    acceptDownloads: true,
    ...(captureMedia
      ? { recordVideo: { dir: path.join(artifacts, "video"), size: { width: 1280, height: 720 } } }
      : {}),
    ...(options?.locale === undefined ? {} : { locale: options.locale }),
    timeout: 30_000,
  });
  if (captureMedia)
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  context.on("page", (page) => attachPageLogging(page, logs));
  context.on("request", (request) => recordRequest(request, logs));
  context.on("serviceworker", (serviceWorker) => attachWorkerLogging(serviceWorker, logs));
  for (const page of context.pages()) attachPageLogging(page, logs);
  for (const serviceWorker of context.serviceWorkers()) attachWorkerLogging(serviceWorker, logs);

  const worker = await waitForExtensionWorker(context);
  const extensionId = new URL(worker.url()).host;
  const extensionOrigin = `chrome-extension://${extensionId}`;
  return {
    context,
    worker,
    extensionId,
    extensionOrigin,
    extensionPath,
    executablePath,
    logs,
    artifacts,
    async close(name: string): Promise<void> {
      await mkdir(artifacts, { recursive: true });
      if (captureMedia)
        await context.tracing
          .stop({ path: path.join(artifacts, `${name}-trace.zip`) })
          .catch(() => undefined);
      await writeFile(
        path.join(artifacts, `${name}-browser-log.json`),
        `${JSON.stringify(logs, null, 2)}\n`,
      );
      await context.close();
    },
  };
}

async function writePinnedExtensionPreference(
  profile: string,
  extensionPath: string,
): Promise<void> {
  const digest = createHash("sha256").update(extensionPath).digest().subarray(0, 16);
  let extensionId = "";
  for (const byte of digest) {
    extensionId += String.fromCharCode(97 + (byte >> 4));
    extensionId += String.fromCharCode(97 + (byte & 0x0f));
  }
  await writeFile(
    path.join(profile, "Default", "Preferences"),
    `${JSON.stringify({ extensions: { pinned_extensions: [extensionId] } })}\n`,
    "utf8",
  );
}

export async function openExtensionPage(
  harness: ExtensionHarness,
  relativePath: string,
): Promise<Page> {
  const page = await harness.context.newPage();
  await page.goto(`${harness.extensionOrigin}/${relativePath.replace(/^\//, "")}`);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

export async function extensionRequest<T>(
  controlPage: Page,
  type: string,
  payload?: unknown,
): Promise<T> {
  messageSequence += 1;
  const requestId = `10000000-0000-4000-8000-${String(messageSequence).padStart(12, "0")}`;
  return controlPage.evaluate(
    async ({ type, payload, requestId, protocolVersion }) => {
      const message = {
        protocolVersion,
        type,
        requestId,
        ...(payload === undefined ? {} : { payload }),
      };
      const response: unknown = await chrome.runtime.sendMessage(message);
      if (
        typeof response !== "object" ||
        response === null ||
        !("requestId" in response) ||
        response.requestId !== requestId ||
        !("success" in response) ||
        typeof response.success !== "boolean"
      )
        throw new Error("Extension response correlation failed in E2E harness.");
      if (!response.success) {
        if (
          !("error" in response) ||
          typeof response.error !== "object" ||
          response.error === null ||
          !("code" in response.error) ||
          !("message" in response.error)
        )
          throw new Error("Malformed extension error response.");
        throw new Error(`${String(response.error.code)}: ${String(response.error.message)}`);
      }
      if (!("data" in response)) throw new Error("Malformed extension success response.");
      return response.data;
    },
    { type, payload, requestId, protocolVersion: PROTOCOL_VERSION },
  ) as Promise<T>;
}

export async function clearExtensionData(controlPage: Page): Promise<void> {
  await extensionRequest(controlPage, "CLEAR_ALL_DATA");
}

export async function createSession(
  controlPage: Page,
  name = "E2E session",
): Promise<CaptureSession> {
  return extensionRequest(controlPage, "SESSION_CREATE", { name });
}

export async function startCapture(
  controlPage: Page,
  fixturePage: Page,
  sessionId: string,
  options?: {
    readonly label?: string;
    readonly screenshot?: boolean;
    readonly includePath?: boolean;
    readonly includeTitle?: boolean;
    readonly includeHidden?: boolean;
    readonly includeTextPreview?: boolean;
    readonly readinessHardTimeoutMs?: number;
    readonly maxTextPreviewChars?: number;
    readonly maxElements?: number;
    readonly maxDepth?: number;
  },
): Promise<CaptureJob> {
  await grantActiveTab(fixturePage);
  return extensionRequest(controlPage, "CAPTURE_START", {
    sessionId,
    userLabel: options?.label ?? "E2E viewport",
    evidenceLabel: "USER_LABELED_VIEWPORT",
    overrides: {
      ...(options?.screenshot === undefined ? {} : { includeScreenshot: options.screenshot }),
      ...(options?.includePath === undefined ? {} : { includePath: options.includePath }),
      ...(options?.includeTitle === undefined ? {} : { includePageTitle: options.includeTitle }),
      ...(options?.includeHidden === undefined
        ? {}
        : { includeHiddenElements: options.includeHidden }),
      ...(options?.includeTextPreview === undefined
        ? {}
        : { includeTextPreview: options.includeTextPreview }),
      ...(options?.readinessHardTimeoutMs === undefined
        ? {}
        : { readinessHardTimeoutMs: options.readinessHardTimeoutMs }),
      ...(options?.maxTextPreviewChars === undefined
        ? {}
        : { maxTextPreviewChars: options.maxTextPreviewChars }),
      ...(options?.maxElements === undefined ? {} : { maxElements: options.maxElements }),
      ...(options?.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
    },
  });
}

export interface BrowserActionPopup {
  isEnabled(selector: string): Promise<boolean>;
  text(selector: string): Promise<string>;
  click(selector: string): Promise<void>;
  close(): Promise<void>;
}

export async function openActionPopup(activePage: Page): Promise<BrowserActionPopup> {
  await activePage.bringToFront();
  if (process.platform === "linux" && process.env.DISPLAY)
    await execFileAsync("python3", [path.resolve("scripts/invoke-browser-action.py")], {
      env: { ...process.env, EDIS_E2E_KEEP_ACTION_OPEN: "true" },
      timeout: 5_000,
    });
  else await activePage.keyboard.press("Control+Shift+E");

  const cdp = await activePage.context().newCDPSession(activePage);
  const target = await waitForPopupTarget(cdp);
  const attachment = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  const bridge = new NestedTargetSession(cdp, attachment.sessionId);
  await bridge.send("Runtime.enable");

  return {
    async isEnabled(selector: string): Promise<boolean> {
      const value = await bridge.evaluate(
        `(selector => { const element = document.querySelector(selector); return element instanceof HTMLButtonElement && !element.disabled; })(${JSON.stringify(selector)})`,
      );
      return value === true;
    },
    async text(selector: string): Promise<string> {
      const value = await bridge.evaluate(
        `(selector => document.querySelector(selector)?.textContent ?? "")(${JSON.stringify(selector)})`,
      );
      return typeof value === "string" ? value : "";
    },
    async click(selector: string): Promise<void> {
      const rect = await bridge.evaluate(
        `(selector => { const element = document.querySelector(selector); if (!(element instanceof HTMLElement)) return null; const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, disabled: element instanceof HTMLButtonElement ? element.disabled : false }; })(${JSON.stringify(selector)})`,
      );
      if (!isPopupRect(rect) || rect.disabled)
        throw new Error(`Popup element is unavailable or disabled: ${selector}`);
      await bridge.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: rect.x,
        y: rect.y,
      });
      await bridge.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: rect.x,
        y: rect.y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      await bridge.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: rect.x,
        y: rect.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    },
    async close(): Promise<void> {
      await cdp.send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
      await cdp.detach().catch(() => undefined);
    },
  };
}

interface PopupTargetInfo {
  readonly targetId: string;
  readonly url: string;
}

interface PopupRect {
  readonly x: number;
  readonly y: number;
  readonly disabled: boolean;
}

function isPopupRect(value: unknown): value is PopupRect {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    typeof candidate.disabled === "boolean"
  );
}

async function waitForPopupTarget(cdp: CDPSession): Promise<PopupTargetInfo> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await cdp.send("Target.getTargets");
    const target = response.targetInfos.find(
      (candidate) =>
        candidate.type === "page" &&
        candidate.url.startsWith("chrome-extension://") &&
        candidate.url.endsWith("/popup/index.html"),
    );
    if (target) return { targetId: target.targetId, url: target.url };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The real browser action popup target did not appear.");
}

class NestedTargetSession {
  readonly #cdp: CDPSession;
  readonly #sessionId: string;
  #sequence = 0;

  constructor(cdp: CDPSession, sessionId: string) {
    this.#cdp = cdp;
    this.#sessionId = sessionId;
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (!isRecord(response) || !isRecord(response.result)) return undefined;
    return response.result.value;
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const listener = (event: { readonly sessionId: string; readonly message: string }): void => {
        if (event.sessionId !== this.#sessionId) return;
        let message: unknown;
        try {
          message = JSON.parse(event.message);
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (!isRecord(message) || message.id !== id) return;
        cleanup();
        if (isRecord(message.error)) {
          const rawMessage = message.error.message;
          const errorMessage =
            typeof rawMessage === "string" && rawMessage.length > 0
              ? rawMessage
              : "Nested CDP command failed.";
          reject(new Error(errorMessage));
          return;
        }
        resolve(isRecord(message.result) ? message.result : {});
      };
      const cleanup = (): void => {
        this.#cdp.off("Target.receivedMessageFromTarget", listener);
      };
      this.#cdp.on("Target.receivedMessageFromTarget", listener);
      this.#cdp
        .send("Target.sendMessageToTarget", {
          sessionId: this.#sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error: unknown) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function grantActiveTab(fixturePage: Page): Promise<void> {
  await fixturePage.bringToFront();
  if (process.platform === "linux" && process.env.DISPLAY)
    await execFileAsync("python3", [path.resolve("scripts/invoke-browser-action.py")], {
      env: process.env,
      timeout: 5_000,
    });
  else await fixturePage.keyboard.press("Control+Shift+E");
  await fixturePage.bringToFront();
}

export async function waitForJob(
  controlPage: Page,
  jobId: string,
  terminal: readonly CaptureJob["status"][] = [
    "COMPLETE",
    "FAILED",
    "CANCELLED",
    "NAVIGATED",
    "INTERRUPTED",
  ],
): Promise<CaptureJob> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const job = await extensionRequest<CaptureJob | undefined>(controlPage, "CAPTURE_STATUS", {
      jobId,
    });
    if (job && terminal.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Capture job ${jobId} did not reach a terminal state.`);
}

export async function captureSnapshot(
  controlPage: Page,
  fixturePage: Page,
  options?: Parameters<typeof startCapture>[3],
): Promise<{
  session: CaptureSession;
  job: CaptureJob;
  snapshot: RuntimeSnapshot;
  screenshot: ScreenshotRecord | null;
}> {
  const session = await createSession(controlPage);
  const job = await startCapture(controlPage, fixturePage, session.data.session_id, options);
  const terminal = await waitForJob(controlPage, job.id);
  if (terminal.status !== "COMPLETE")
    throw new Error(
      `Capture ended with ${terminal.status}: ${JSON.stringify(terminal.diagnostics)}`,
    );
  const snapshots = await readStore<RuntimeSnapshot>(controlPage, "snapshots");
  const snapshot = snapshots.find((candidate) => candidate.snapshot_id === terminal.snapshotId);
  if (!snapshot) throw new Error("Completed capture snapshot was not persisted.");
  const screenshots = await readStore<ScreenshotRecord>(controlPage, "screenshots");
  return {
    session,
    job: terminal,
    snapshot,
    screenshot:
      screenshots.find((candidate) => candidate.snapshotId === terminal.snapshotId) ?? null,
  };
}

export async function readStore<T>(controlPage: Page, storeName: string): Promise<T[]> {
  return controlPage.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("edis-runtime-collector", 4);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const transaction = database.transaction(name, "readonly");
        const request = transaction.objectStore(name).getAll();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
        request.onsuccess = () => resolve(request.result as T[]);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

export async function storedScreenshotSha256(
  controlPage: Page,
  snapshotId: string,
): Promise<string | null> {
  return controlPage.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("edis-runtime-collector", 4);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const record = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction("screenshots", "readonly");
        const request = transaction.objectStore("screenshots").get(id);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
        request.onsuccess = () => resolve(request.result);
      });
      if (!record || typeof record !== "object") return null;
      const bytes = (record as { bytes?: unknown }).bytes;
      if (!(bytes instanceof ArrayBuffer)) return null;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    } finally {
      database.close();
    }
  }, snapshotId);
}

export function canonicalizeFullArtifact(value: unknown): string {
  return canonicalJson(value);
}

export function canonicalizeSemanticArtifact(value: unknown): string {
  return canonicalSemanticJson(value);
}

export function compareSemanticArtifacts(
  left: unknown,
  right: unknown,
): {
  readonly equal: boolean;
  readonly left: string;
  readonly right: string;
} {
  const leftCanonical = canonicalizeSemanticArtifact(left);
  const rightCanonical = canonicalizeSemanticArtifact(right);
  return { equal: leftCanonical === rightCanonical, left: leftCanonical, right: rightCanonical };
}

export async function terminateServiceWorker(harness: ExtensionHarness): Promise<void> {
  const browser = harness.context.browser();
  if (!browser) throw new Error("Browser CDP session is unavailable for persistent context.");
  const cdp = await browser.newBrowserCDPSession();
  try {
    const targets = (await cdp.send("Target.getTargets")) as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };
    const target = targets.targetInfos.find(
      (item) => item.type === "service_worker" && item.url.startsWith(harness.extensionOrigin),
    );
    if (!target) throw new Error("Extension service-worker target was not found.");
    await cdp.send("Target.closeTarget", { targetId: target.targetId });
  } finally {
    await cdp.detach();
  }
}

export async function waitForReplacementWorker(harness: ExtensionHarness): Promise<Worker> {
  const existing = harness.context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith(harness.extensionOrigin));
  return existing ?? harness.context.waitForEvent("serviceworker", { timeout: 20_000 });
}

export async function sha256File(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export function extensionExternalRequests(harness: ExtensionHarness): HarnessLogs["requests"] {
  return harness.logs.requests.filter((item) => {
    if (!item.source?.startsWith(harness.extensionOrigin)) return false;
    try {
      const url = new URL(item.url);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
}

export async function fixture(page: Page, name: string): Promise<void> {
  await page.goto(`http://127.0.0.1:4173/${name}`);
  await page.waitForFunction(() => document.documentElement.dataset.edisReady === "true");
}

function configuredBrowser(): BrowserTarget {
  return process.env.EDIS_E2E_BROWSER === "edge" ? "edge" : "chrome";
}

function configuredHeadless(): boolean {
  return process.env.EDIS_E2E_HEADLESS === "true" || process.env.EDIS_E2E_HEADLESS === "1";
}

async function resolveExecutable(browser: BrowserTarget): Promise<string> {
  const candidate =
    process.env.EDIS_E2E_RESOLVED_EXECUTABLE_PATH ??
    (browser === "edge"
      ? process.env.EDIS_EDGE_EXECUTABLE_PATH
      : (process.env.EDIS_CHROME_EXECUTABLE_PATH ??
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        chromium.executablePath()));
  if (!candidate) throw new Error(`No executable was configured for ${browser}.`);
  const resolved = path.resolve(candidate);
  await access(resolved, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
  return resolved;
}

async function waitForExtensionWorker(context: BrowserContext): Promise<Worker> {
  const existing = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith("chrome-extension://"));
  if (existing) return existing;
  const worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
  if (!worker.url().startsWith("chrome-extension://"))
    throw new Error(`Unexpected service-worker URL: ${worker.url()}`);
  return worker;
}

function attachPageLogging(page: Page, logs: HarnessLogs): void {
  page.on("console", (message) =>
    logs.console.push(`${page.url()} ${message.type()} ${message.text()}`),
  );
  page.on("pageerror", (error) => logs.pageErrors.push(`${page.url()} ${error.message}`));
}

function attachWorkerLogging(worker: Worker, logs: HarnessLogs): void {
  if (!logs.serviceWorkers.includes(worker.url())) logs.serviceWorkers.push(worker.url());
  worker.on("console", (message) =>
    logs.console.push(`${worker.url()} ${message.type()} ${message.text()}`),
  );
}

function recordRequest(request: Request, logs: HarnessLogs): void {
  logs.requests.push({
    url: request.url(),
    method: request.method(),
    source: requestSource(request),
  });
}

function requestSource(request: Request): string | null {
  try {
    return request.serviceWorker()?.url() ?? request.frame().url();
  } catch {
    return null;
  }
}
