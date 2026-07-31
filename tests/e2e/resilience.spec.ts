import { expect, test, type Page } from "@playwright/test";
import type { CaptureJob, RuntimeSnapshot } from "../../src/domain/model";
import {
  captureSnapshot,
  clearExtensionData,
  createSession,
  extensionRequest,
  fixture,
  launchExtensionHarness,
  openExtensionPage,
  readStore,
  startCapture,
  terminateServiceWorker,
  waitForJob,
  waitForReplacementWorker,
  type ExtensionHarness,
} from "./harness";

let harness: ExtensionHarness;
let control: Page;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "resilience" });
  control = await openExtensionPage(harness, "options/index.html");
});

test.afterAll(async () => {
  await control?.close().catch(() => undefined);
  await harness?.close("resilience");
});

test.beforeEach(async () => {
  await clearExtensionData(control);
});

test("idle service-worker termination preserves persisted sessions and reconstructs UI state", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  const capture = await captureSnapshot(control, page);
  await terminateServiceWorker(harness);
  const state = await extensionRequest<{
    currentSessionId: string | null;
    sessions: Array<{ data: { session_id: string; captures: unknown[] } }>;
  }>(control, "STATE_GET");
  await waitForReplacementWorker(harness);
  expect(
    state.sessions.some((session) => session.data.session_id === capture.session.data.session_id),
  ).toBe(true);
  expect(
    state.sessions.find((session) => session.data.session_id === capture.session.data.session_id)
      ?.data.captures,
  ).toHaveLength(1);
  await page.close();
});

test("real worker termination during capture ends in a recoverable complete or explicit terminal state", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "mutation-stress.html");
  const session = await createSession(control, "Worker interruption");
  const job = await startCapture(control, page, session.data.session_id, { maxElements: 1000 });
  await terminateServiceWorker(harness);
  const terminal = await waitForJob(control, job.id);
  expect(["COMPLETE", "INTERRUPTED", "FAILED"]).toContain(terminal.status);
  const snapshots = await readStore<RuntimeSnapshot>(control, "snapshots");
  const snapshot = snapshots.find((item) => item.snapshot_id === terminal.snapshotId);
  if (terminal.status === "COMPLETE") {
    expect(snapshot).toBeDefined();
    expect(snapshot?.session_id).toBe(session.data.session_id);
  } else {
    expect(snapshot).toBeUndefined();
    expect(
      terminal.diagnostics.some((item) =>
        ["EDIS_RUNTIME_WORKER_INTERRUPTED", "EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT"].includes(
          item.code,
        ),
      ),
    ).toBe(true);
  }
  await page.close();
});

test("navigation, reload, History API changes, and tab closure never merge documents", async () => {
  for (const mode of ["navigation", "reload", "history", "close"] as const) {
    await clearExtensionData(control);
    const page = await harness.context.newPage();
    await fixture(page, "mutation-stress.html");
    const session = await createSession(control, `Navigation ${mode}`);
    const job = await startCapture(control, page, session.data.session_id, { maxElements: 1000 });
    if (mode === "navigation") await page.goto("http://127.0.0.1:4173/navigation-target.html");
    if (mode === "reload") await page.reload();
    if (mode === "history")
      await page.evaluate(() => history.pushState({}, "", "/navigation-target.html?history=1"));
    if (mode === "close") await page.close();
    const terminal = await waitForJob(control, job.id);
    expect(["NAVIGATED", "INTERRUPTED", "FAILED"]).toContain(terminal.status);
    expect(terminal.diagnostics.some((item) => item.code === "EDIS_RUNTIME_TAB_NAVIGATED")).toBe(
      true,
    );
    expect(
      (await readStore<RuntimeSnapshot>(control, "snapshots")).some(
        (snapshot) => snapshot.snapshot_id === job.snapshotId,
      ),
    ).toBe(false);
    if (!page.isClosed()) await page.close();
  }
});

test("same-tab duplicate capture start is rejected while the first job remains active", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "mutation-stress.html");
  const session = await createSession(control, "Same-tab concurrency");
  const first = await startCapture(control, page, session.data.session_id, { maxElements: 1000 });
  await expect(
    startCapture(control, page, session.data.session_id, { maxElements: 1000 }),
  ).rejects.toThrow(/EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_(TAB|SESSION)/);
  expect(
    (await readStore<CaptureJob>(control, "jobs")).filter(
      (job) =>
        job.sessionId === session.data.session_id &&
        ["PREPARED", "INJECTED", "RECEIVING", "ASSEMBLING"].includes(job.status),
    ),
  ).toHaveLength(1);
  await waitForJob(control, first.id);
  await page.close();
});

test("same-session capture on another tab is rejected until the active observation finishes", async () => {
  const firstPage = await harness.context.newPage();
  const secondPage = await harness.context.newPage();
  await fixture(firstPage, "mutation-stress.html");
  await fixture(secondPage, "non-elementor.html");
  const session = await createSession(control, "Cross-tab concurrency");
  const first = await startCapture(control, firstPage, session.data.session_id, {
    maxElements: 1000,
  });
  await expect(startCapture(control, secondPage, session.data.session_id)).rejects.toThrow(
    /EDIS_RUNTIME_ACTIVE_CAPTURE_EXISTS_FOR_SESSION/,
  );
  await waitForJob(control, first.id);
  await firstPage.close();
  await secondPage.close();
});

test("mutation, large DOM, deep DOM, hidden, overflow, RTL, detached, and malicious inputs remain bounded", async () => {
  for (const name of [
    "mutation-stress.html",
    "large-dom.html",
    "responsive-overflow.html",
    "rtl.html",
    "malicious-dom.html",
  ]) {
    await clearExtensionData(control);
    const page = await harness.context.newPage();
    await fixture(page, name);
    const before =
      name === "mutation-stress.html"
        ? null
        : await page.locator("html").evaluate((element) => element.outerHTML);
    const { snapshot } = await captureSnapshot(control, page, {
      includeHidden: true,
      maxElements: 500,
      maxDepth: 12,
    });
    expect(snapshot.elements.length).toBeLessThanOrEqual(500);
    expect(snapshot.document_metrics.maximum_measured_depth).toBeLessThanOrEqual(12);
    expect(snapshot.elements.every((item, index) => item.document_order === index)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("not-exported");
    expect(JSON.stringify(snapshot)).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    if (before !== null)
      expect(await page.locator("html").evaluate((element) => element.outerHTML)).toBe(before);
    await page.close();
  }
});

test("main-world geometry monkeypatches cannot inject non-finite evidence into the isolated collector", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-finite-geometry.html");
  const { snapshot } = await captureSnapshot(control, page, { includeHidden: true });
  expect(allFinite(snapshot)).toBe(true);
  expect(
    snapshot.diagnostics.some((item) => item.code === "EDIS_RUNTIME_NON_FINITE_GEOMETRY"),
  ).toBe(false);
  expect(
    snapshot.elements.some((item) => item.identity.stable_dom_reference.includes("non-finite")),
  ).toBe(true);
  await page.close();
});

test("visible descendant overrides ancestor visibility hidden without hidden-subtree pruning", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  await page.evaluate(() => {
    document.body.replaceChildren();
    const parent = document.createElement("section");
    parent.id = "visibility-hidden-parent";
    parent.style.visibility = "hidden";
    const child = document.createElement("button");
    child.id = "visibility-visible-child";
    child.style.visibility = "visible";
    child.style.width = "120px";
    child.style.height = "40px";
    child.textContent = "Visible child";
    parent.append(child);
    document.body.append(parent);
  });
  const { snapshot } = await captureSnapshot(control, page);
  const child = snapshot.elements.find((item) =>
    item.identity.stable_dom_reference.includes("visibility-visible-child"),
  );
  expect(child).toBeDefined();
  expect(child?.visibility.effective_rendered).toBe(true);
  expect(snapshot.capture_completeness.skipped_hidden_subtree_count).toBe(0);
  await page.close();
});

test("viewport image membership refreshes after viewport geometry changes without a DOM mutation", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  await page.setViewportSize({ width: 900, height: 500 });
  await page.evaluate(() => {
    document.body.replaceChildren();
    document.body.style.minHeight = "1400px";
    for (const [id, top] of [
      ["pending-visible", 20],
      ["pending-enters-viewport", 800],
    ] as const) {
      const image = document.createElement("img");
      image.id = id;
      image.src = `http://192.0.2.1/${id}.png`;
      image.style.position = "absolute";
      image.style.left = "20px";
      image.style.top = `${top}px`;
      image.style.width = "40px";
      image.style.height = "40px";
      document.body.append(image);
    }
  });
  const session = await createSession(control, "Viewport image membership rescan");
  const job = await startCapture(control, page, session.data.session_id, {
    readinessHardTimeoutMs: 1500,
  });
  await page.setViewportSize({ width: 900, height: 1000 });
  const terminal = await waitForJob(control, job.id);
  expect(terminal.status).toBe("COMPLETE");
  const snapshot = (await readStore<RuntimeSnapshot>(control, "snapshots")).find(
    (item) => item.snapshot_id === job.snapshotId,
  );
  expect(snapshot).toBeDefined();
  const readiness = snapshot?.capture_readiness.viewport_image_readiness;
  expect(readiness?.candidate_count).toBeGreaterThanOrEqual(2);
  expect(
    (readiness?.broken_count ?? 0) +
      (readiness?.pending_count ?? 0) +
      (readiness?.decode_failed_count ?? 0) +
      (readiness?.timed_out_count ?? 0),
  ).toBeGreaterThan(0);
  await page.close();
});

test("chunk persistence and finalization remain idempotent after completed capture", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "large-dom.html");
  const { job, snapshot } = await captureSnapshot(control, page, { maxElements: 1000 });
  expect(await readStore(control, "chunks")).toHaveLength(0);
  const before = await readStore<RuntimeSnapshot>(control, "snapshots");
  const status = await extensionRequest<CaptureJob | undefined>(control, "CAPTURE_STATUS", {
    jobId: job.id,
  });
  expect(status?.status).toBe("COMPLETE");
  const after = await readStore<RuntimeSnapshot>(control, "snapshots");
  expect(after.filter((item) => item.snapshot_id === snapshot.snapshot_id)).toHaveLength(1);
  expect(after).toHaveLength(before.length);
  await page.close();
});

function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (typeof value === "object" && value !== null)
    return Object.values(value as Record<string, unknown>).every(allFinite);
  return true;
}
