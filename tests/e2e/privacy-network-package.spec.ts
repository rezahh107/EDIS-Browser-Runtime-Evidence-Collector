import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { RuntimeSnapshot } from "../../src/domain/model";
import {
  captureSnapshot,
  clearExtensionData,
  extensionExternalRequests,
  fixture,
  launchExtensionHarness,
  openExtensionPage,
  readStore,
  type ExtensionHarness,
} from "./harness";
import { parseStoreZip } from "./zip";

let harness: ExtensionHarness;
let control: Page;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "privacy-network-package" });
  control = await openExtensionPage(harness, "options/index.html");
});

test.afterAll(async () => {
  await control?.close().catch(() => undefined);
  await harness?.close("privacy-network-package");
});

test.beforeEach(async () => {
  await clearExtensionData(control);
});

test("default runtime evidence excludes form values, secrets, URL query, fragment, and full text", async () => {
  const page = await harness.context.newPage();
  await page.goto(
    "http://127.0.0.1:4173/privacy-secrets.html?token=query-private#fragment-private",
  );
  await page.waitForFunction(() => document.documentElement.dataset.edisReady === "true");
  const { snapshot } = await captureSnapshot(control, page, {
    includePath: true,
    includeTitle: false,
    includeTextPreview: false,
  });
  const serialized = JSON.stringify(snapshot);
  for (const secret of [
    "CorrectHorseBatteryStaple",
    "hidden-private-value",
    "alice@example.test",
    "4111111111111111",
    "private textarea content",
    "private contenteditable content",
    "private-auth-token-1234567890",
    "query-private",
    "fragment-private",
    "Visible private full text",
  ])
    expect(serialized).not.toContain(secret);
  expect(snapshot.page.path).toBe("/:redacted");
  expect(snapshot.page.title).toBeNull();
  expect(snapshot.elements.every((item) => item.text_shape.preview === null)).toBe(true);
  await page.close();
});

test("explicit text-preview opt-in is bounded, redacted, and never reads form-control values", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "privacy-secrets.html");
  const { snapshot } = await captureSnapshot(control, page, {
    includeTextPreview: true,
    maxTextPreviewChars: 24,
  });
  expect(snapshot.privacy.text_preview_requested).toBe(true);
  expect(snapshot.privacy.text_preview_limit).toBe(24);
  const previews = snapshot.elements
    .map((item) => item.text_shape.preview)
    .filter((value): value is string => value !== null);
  expect(previews.every((value) => value.length <= 24)).toBe(true);
  const serialized = JSON.stringify(snapshot);
  for (const secret of [
    "CorrectHorseBatteryStaple",
    "hidden-private-value",
    "4111111111111111",
    "private textarea content",
  ])
    expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain("alice@example.test");
  expect(serialized).toContain("[REDACTED_");
  await page.close();
});

test("extension-originated external network communication remains absent", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  await captureSnapshot(control, page);
  await openExtensionPage(harness, "popup/index.html").then((popup) => popup.close());
  await openExtensionPage(harness, "sidepanel/index.html").then((panel) => panel.close());
  await control.reload();
  expect(extensionExternalRequests(harness)).toEqual([]);
  await page.close();
});

test("real exported package is readable, canonical, checksum-valid, traversal-safe, and complete", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  const capture = await captureSnapshot(control, page, { screenshot: true });
  const panel = await openExtensionPage(harness, "sidepanel/index.html");
  await expect(panel.locator("#session-select")).toHaveValue(capture.session.data.session_id);
  const downloadPromise = panel.waitForEvent("download");
  await panel.locator("#export-button").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Browser did not expose the exported package path.");
  const packageBytes = new Uint8Array(await readFile(downloadPath));
  await writeQualificationRuntimeScenario(
    control,
    harness,
    capture.job.id,
    capture.session.data.session_id,
    packageBytes,
  );
  const entries = parseStoreZip(packageBytes);
  const paths = entries.map((entry) => entry.path);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths).toEqual([...paths].sort());
  expect(paths).toContain("package-manifest.json");
  expect(paths).toContain("checksums.sha256");
  expect(paths).toContain("README.txt");
  expect(paths.some((entry) => entry.endsWith(".png"))).toBe(true);
  expect(paths.every(isSafeRelativePath)).toBe(true);
  expect(entries.every((entry) => entry.compressionMethod === 0)).toBe(true);
  expect(entries.every((entry) => entry.dosTime === 0 && entry.dosDate === 0x21)).toBe(true);

  const byPath = new Map(entries.map((entry) => [entry.path, entry.bytes]));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const checksums = decoder.decode(requiredEntry(byPath, "checksums.sha256"));
  for (const line of checksums.trim().split("\n")) {
    const match = /^(sha256:[0-9a-f]{64}) {2}(.+)$/.exec(line);
    expect(match).not.toBeNull();
    if (!match) continue;
    const expectedHash = match[1];
    const entryPath = match[2];
    if (!expectedHash || !entryPath) throw new Error("Malformed checksum record.");
    expect(
      `sha256:${createHash("sha256").update(requiredEntry(byPath, entryPath)).digest("hex")}`,
    ).toBe(expectedHash);
  }
  const manifestText = decoder.decode(requiredEntry(byPath, "package-manifest.json"));
  expect(manifestText.endsWith("\n")).toBe(true);
  const parsedManifest: unknown = JSON.parse(manifestText);
  if (!isPackageManifest(parsedManifest))
    throw new Error("Exported package manifest is malformed.");
  const manifest = parsedManifest;
  expect(manifest.data.package_validation_state).toBe("PASS");
  expect(["COMPLETE", "PARTIAL"]).toContain(manifest.data.capture_completeness);
  for (const record of manifest.data.files) {
    const bytes = requiredEntry(byPath, record.path);
    expect(bytes.length).toBe(record.bytes);
    expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(record.sha256);
  }
  for (const schemaPath of paths.filter(
    (entry) => entry.startsWith("schemas/") && entry.endsWith(".json"),
  )) {
    expect(() => {
      const parsedSchema: unknown = JSON.parse(decoder.decode(requiredEntry(byPath, schemaPath)));
      void parsedSchema;
    }).not.toThrow();
  }

  expect(await readStore<RuntimeSnapshot>(control, "snapshots")).toHaveLength(0);
  expect(await readStore(control, "screenshots")).toHaveLength(0);
  await panel.close();
  await page.close();
});

test("@smoke blocked minimum feed offers a runtime-evidence fallback download", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  const capture = await captureSnapshot(control, page);
  await setSessionWorkflowMode(control, capture.session.data.session_id, "MINIMUM_PYTHON_FEED");

  const panel = await openExtensionPage(harness, "sidepanel/index.html");
  await expect(panel.locator("#session-select")).toHaveValue(capture.session.data.session_id);
  await expect(panel.locator("#export-button")).toBeVisible();
  await expect(panel.locator("#export-python-feed-button")).toBeVisible();

  await panel.locator("#export-python-feed-button").click();
  await expect(panel.locator("#export-preflight-dialog")).toBeVisible();
  await expect(panel.locator("#export-preflight-blockers-box")).toBeVisible();
  await expect(panel.locator("#confirm-export")).toBeDisabled();
  await expect(panel.locator("#export-runtime-instead")).toBeVisible();

  const downloadPromise = panel.waitForEvent("download");
  await panel.locator("#export-runtime-instead").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^edis-runtime-package-.+\.zip$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Browser did not expose the fallback package path.");
  const paths = parseStoreZip(new Uint8Array(await readFile(downloadPath))).map(
    (entry) => entry.path,
  );
  expect(paths).toContain("package-manifest.json");
  expect(paths).not.toContain("source-context/wordpress-source-context.json");

  await panel.close();
  await page.close();
});

async function writeQualificationRuntimeScenario(
  controlPage: Page,
  harness: ExtensionHarness,
  captureJobId: string,
  sessionId: string,
  packageBytes: Uint8Array,
): Promise<void> {
  const runtime = await controlPage.evaluate(async () => {
    const databaseVersion = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("edis-runtime-collector", 4);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
      request.onsuccess = () => {
        const database = request.result;
        const version = database.version;
        database.close();
        resolve(version);
      };
    });
    const startup = await chrome.storage.session.get("edis:service-worker-startup-sequence");
    return {
      indexeddb_version: databaseVersion,
      service_worker_startup_sequence:
        typeof startup["edis:service-worker-startup-sequence"] === "number"
          ? startup["edis:service-worker-startup-sequence"]
          : null,
    };
  });
  const record = {
    schema_version: "1.6.0",
    indexeddb_version: runtime.indexeddb_version,
    session_id: sessionId,
    capture_job_id: captureJobId,
    extension_id: harness.extensionId,
    exported_package_sha256: createHash("sha256").update(packageBytes).digest("hex"),
    service_worker_startup_sequence: runtime.service_worker_startup_sequence,
  };
  await mkdir(harness.artifacts, { recursive: true });
  await writeFile(
    `${harness.artifacts}/qualification-runtime-scenario.json`,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

async function setSessionWorkflowMode(
  extensionPage: Page,
  sessionId: string,
  workflowMode: "RUNTIME_EVIDENCE" | "MINIMUM_PYTHON_FEED",
): Promise<void> {
  await extensionPage.evaluate(
    async ({ sessionId, workflowMode }) => {
      await new Promise<void>((resolve, reject) => {
        const openRequest = indexedDB.open("edis-runtime-collector", 4);
        openRequest.onerror = () =>
          reject(openRequest.error ?? new Error("IndexedDB open failed."));
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("sessions", "readwrite");
          const store = transaction.objectStore("sessions");
          const getRequest = store.get(sessionId);
          getRequest.onerror = () => reject(getRequest.error ?? new Error("Session read failed."));
          getRequest.onsuccess = () => {
            const session = getRequest.result as
              | { data?: { workflow_mode?: string | null } }
              | undefined;
            if (!session?.data) {
              transaction.abort();
              reject(new Error("Session was not found for E2E setup."));
              return;
            }
            session.data.workflow_mode = workflowMode;
            store.put(session);
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("Session update failed."));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error("Session update aborted."));
        };
      });
    },
    { sessionId, workflowMode },
  );
}

function requiredEntry(entries: ReadonlyMap<string, Uint8Array>, name: string): Uint8Array {
  const value = entries.get(name);
  if (!value) throw new Error(`Required ZIP entry is missing: ${name}`);
  return value;
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

function isPackageManifest(value: unknown): value is {
  schema_id: "urn:edis:schema:browser:package-manifest";
  schema_version: "1.4.0";
  artifact_type: "runtime_package_manifest";
  data: {
    package_validation_state: "PASS" | "FAIL" | "NOT_RUN";
    capture_completeness: "COMPLETE" | "PARTIAL";
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
} {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Record<string, unknown>;
  if (
    envelope.schema_id !== "urn:edis:schema:browser:package-manifest" ||
    envelope.schema_version !== "1.4.0" ||
    envelope.artifact_type !== "runtime_package_manifest" ||
    typeof envelope.data !== "object" ||
    envelope.data === null
  )
    return false;
  const data = envelope.data as Record<string, unknown>;
  return (
    ["PASS", "FAIL", "NOT_RUN"].includes(String(data.package_validation_state)) &&
    ["COMPLETE", "PARTIAL"].includes(String(data.capture_completeness)) &&
    Array.isArray(data.files) &&
    data.files.every((item: unknown) => isPackageFileRecord(item))
  );
}

function isPackageFileRecord(
  value: unknown,
): value is { path: string; bytes: number; sha256: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === "string" &&
    typeof record.bytes === "number" &&
    Number.isSafeInteger(record.bytes) &&
    record.bytes >= 0 &&
    typeof record.sha256 === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(record.sha256)
  );
}
