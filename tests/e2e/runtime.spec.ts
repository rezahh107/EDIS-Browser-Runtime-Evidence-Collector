import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { CaptureSession, RuntimeSnapshot } from "../../src/domain/model";
import {
  canonicalizeFullArtifact,
  captureSnapshot,
  clearExtensionData,
  compareSemanticArtifacts,
  createSession,
  fixture,
  launchExtensionHarness,
  openExtensionPage,
  readStore,
  startCapture,
  storedScreenshotSha256,
  waitForJob,
  type ExtensionHarness,
} from "./harness";

const GEOMETRY_TOLERANCE = 0.02;
const VIEWPORT_TOLERANCE = 1;
let harness: ExtensionHarness;
let control: Page;

test.beforeAll(async () => {
  harness = await launchExtensionHarness({ name: "runtime" });
  control = await openExtensionPage(harness, "options/index.html");
});

test.afterAll(async () => {
  await control?.close().catch(() => undefined);
  await harness?.close("runtime");
});

test.beforeEach(async () => {
  await clearExtensionData(control);
});

test("runtime measurements match independent browser measurements within documented tolerances", async () => {
  const page = await harness.context.newPage();
  await page.setViewportSize({ width: 1100, height: 720 });
  await fixture(page, "deterministic-measurements.html");
  const independent = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>("#absolute-box");
    if (!element) throw new Error("Fixture element missing.");
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      viewport: {
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        devicePixelRatio,
        visualViewport: window.visualViewport
          ? {
              width: window.visualViewport.width,
              height: window.visualViewport.height,
              scale: window.visualViewport.scale,
            }
          : null,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientWidth: document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
      },
      element: {
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        offsetWidth: element.offsetWidth,
        offsetHeight: element.offsetHeight,
        position: style.position,
        display: style.display,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      },
    };
  });
  const { snapshot } = await captureSnapshot(control, page, { includeHidden: true });
  expectNear(snapshot.viewport.inner_width, independent.viewport.innerWidth, VIEWPORT_TOLERANCE);
  expectNear(snapshot.viewport.inner_height, independent.viewport.innerHeight, VIEWPORT_TOLERANCE);
  expectNear(snapshot.viewport.outer_width, independent.viewport.outerWidth, VIEWPORT_TOLERANCE);
  expectNear(snapshot.viewport.outer_height, independent.viewport.outerHeight, VIEWPORT_TOLERANCE);
  expectNear(snapshot.viewport.device_pixel_ratio, independent.viewport.devicePixelRatio, 0.001);
  if (independent.viewport.visualViewport && snapshot.viewport.visual_viewport) {
    expectNear(
      snapshot.viewport.visual_viewport.width,
      independent.viewport.visualViewport.width,
      VIEWPORT_TOLERANCE,
    );
    expectNear(
      snapshot.viewport.visual_viewport.height,
      independent.viewport.visualViewport.height,
      VIEWPORT_TOLERANCE,
    );
    expectNear(
      snapshot.viewport.visual_viewport.scale,
      independent.viewport.visualViewport.scale,
      0.001,
    );
  }
  expect(snapshot.document_metrics.document_scroll_width).toBe(
    independent.viewport.documentScrollWidth,
  );
  expect(snapshot.document_metrics.document_scroll_height).toBe(
    independent.viewport.documentScrollHeight,
  );
  expect(snapshot.document_metrics.document_client_width).toBe(
    independent.viewport.documentClientWidth,
  );
  expect(snapshot.document_metrics.document_client_height).toBe(
    independent.viewport.documentClientHeight,
  );

  const measured = snapshot.elements.find((item) =>
    item.identity.stable_dom_reference.includes("absolute-box"),
  );
  expect(measured).toBeDefined();
  if (!measured) throw new Error("Absolute fixture element was not captured.");
  for (const key of ["x", "y", "width", "height", "top", "right", "bottom", "left"] as const)
    expectNear(measured.bounding_rect[key], independent.element.rect[key], GEOMETRY_TOLERANCE);
  expect(measured.overflow.client_width).toBe(independent.element.clientWidth);
  expect(measured.overflow.client_height).toBe(independent.element.clientHeight);
  expect(measured.overflow.scroll_width).toBe(independent.element.scrollWidth);
  expect(measured.overflow.scroll_height).toBe(independent.element.scrollHeight);
  expect(measured.overflow.offset_width).toBe(independent.element.offsetWidth);
  expect(measured.overflow.offset_height).toBe(independent.element.offsetHeight);
  expect(measured.positioning).toBe(independent.element.position);
  expect(measured.computed_styles.display).toBe(independent.element.display);
  expect(measured.computed_styles["overflow-x"]).toBe(independent.element.overflowX);
  expect(measured.computed_styles["overflow-y"]).toBe(independent.element.overflowY);
  expect(snapshot.document_metrics.horizontal_page_overflow).toBe(true);
  expect(snapshot.document_metrics.discovered_fixed_elements).toBeGreaterThanOrEqual(1);
  expect(snapshot.document_metrics.discovered_sticky_elements).toBeGreaterThanOrEqual(1);

  const wrapped = snapshot.elements.find((item) =>
    item.identity.stable_dom_reference.includes("wrapped"),
  );
  const truncated = snapshot.elements.find((item) =>
    item.identity.stable_dom_reference.includes("truncated"),
  );
  expect(wrapped?.text_shape.white_space).toBe("normal");
  expect(truncated?.text_shape.text_overflow).toBe("ellipsis");
  expect(truncated?.text_shape.horizontal_clipping).toBe(true);
  await page.close();
});

test("Elementor V3, Atomic V4, hybrid, and non-Elementor identities remain factual", async () => {
  for (const [name, expectedIds] of [
    ["elementor-v3.html", ["abc123"]],
    ["atomic-v4.html", ["v4root", "grid01", "flex01", "block02"]],
    ["hybrid.html", ["legacy01", "atomic01"]],
  ] as const) {
    const page = await harness.context.newPage();
    await fixture(page, name);
    const { snapshot } = await captureSnapshot(control, page);
    for (const expected of expectedIds)
      expect(
        snapshot.elements.some(
          (item) =>
            item.runtime_elementor_markers.data_id === expected ||
            item.runtime_elementor_markers.data_elementor_id === expected,
        ),
      ).toBe(true);
    expect(snapshot.status).not.toBe("FAILED");
    await page.close();
  }

  const normal = await harness.context.newPage();
  await fixture(normal, "non-elementor.html");
  const { snapshot } = await captureSnapshot(control, normal);
  expect(snapshot.page.elementor.page_marker_present).toBe(false);
  expect(
    snapshot.elements.every(
      (item) =>
        item.runtime_elementor_markers.data_id === null &&
        item.runtime_elementor_markers.data_elementor_id === null,
    ),
  ).toBe(true);
  expect(
    snapshot.elements.some((item) => item.identity.identity_strategy === "STRUCTURAL_PATH"),
  ).toBe(true);
  await normal.close();
});

test("multi-viewport captures use actual dimensions and deterministic capture ordering", async () => {
  const page = await harness.context.newPage();
  const session = await createSession(control, "Multi viewport");
  const viewports = [
    ["Desktop", 1280, 720],
    ["Tablet", 768, 900],
    ["Mobile", 390, 844],
    ["Small Mobile", 320, 568],
    ["Custom", 912, 640],
  ] as const;
  for (const [label, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await fixture(page, "non-elementor.html");
    const job = await startCapture(control, page, session.data.session_id, { label });
    expect((await waitForJob(control, job.id)).status).toBe("COMPLETE");
  }
  const snapshots = (await readStore<RuntimeSnapshot>(control, "snapshots")).sort(
    (a, b) =>
      a.captured_at.localeCompare(b.captured_at) || a.snapshot_id.localeCompare(b.snapshot_id),
  );
  expect(snapshots).toHaveLength(viewports.length);
  for (const [index, [label, width, height]] of viewports.entries()) {
    expect(snapshots[index]?.viewport.user_label).toBe(label);
    expectNear(snapshots[index]?.viewport.inner_width ?? 0, width, VIEWPORT_TOLERANCE);
    expectNear(snapshots[index]?.viewport.inner_height ?? 0, height, VIEWPORT_TOLERANCE);
    expect("official_breakpoint_id" in (snapshots[index]?.viewport ?? {})).toBe(false);
    expect(snapshots[index]?.viewport.evidence_label).toBe("USER_LABELED_VIEWPORT");
  }
  await page.close();
});

test("runtime determinism semantic replay is byte-identical while allowed operational fields differ", async () => {
  const page = await harness.context.newPage();
  await page.setViewportSize({ width: 1024, height: 700 });
  const session = await createSession(control, "Determinism");
  await fixture(page, "deterministic-measurements.html");
  const first = await captureInSession(control, page, session, "Replay");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.edisReady === "true");
  const second = await captureInSession(control, page, session, "Replay");

  expect(canonicalizeFullArtifact(first)).not.toBe(canonicalizeFullArtifact(second));
  expect(first.snapshot_id).not.toBe(second.snapshot_id);
  expect(first.captured_at).not.toBe(second.captured_at);
  expect(first.session_id).toBe(second.session_id);
  const comparison = compareSemanticArtifacts(first, second);
  expect(
    comparison.equal,
    comparison.equal ? "" : semanticDifference(comparison.left, comparison.right),
  ).toBe(true);
  await page.close();
});

test("screenshot disabled and enabled modes preserve independent evidence integrity", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "non-elementor.html");
  const disabled = await captureSnapshot(control, page, { screenshot: false });
  expect(disabled.screenshot).toBeNull();
  expect(disabled.snapshot.privacy.screenshot_requested).toBe(false);

  const enabled = await captureSnapshot(control, page, { screenshot: true });
  expect(enabled.snapshot.privacy.screenshot_requested).toBe(true);
  expect(enabled.screenshot?.mimeType).toBe("image/png");
  if (!enabled.screenshot) throw new Error("Expected visible viewport screenshot was not stored.");
  expect(await storedScreenshotSha256(control, enabled.screenshot.snapshotId)).toBe(
    enabled.screenshot.checksumSha256,
  );
  const snapshotHash = createHash("sha256")
    .update(canonicalizeFullArtifact(enabled.snapshot))
    .digest("hex");
  expect(snapshotHash).not.toBe(enabled.screenshot.checksumSha256);
  await page.close();
});

test("screenshot failure produces a diagnostic without destroying JSON evidence", async () => {
  const page = await harness.context.newPage();
  await fixture(page, "mutation-stress.html");
  const session = await createSession(control, "Screenshot failure");
  const job = await startCapture(control, page, session.data.session_id, { screenshot: true });
  await control.bringToFront();
  const terminal = await waitForJob(control, job.id);
  expect(terminal.status, JSON.stringify(terminal.diagnostics)).toBe("COMPLETE");
  const snapshots = await readStore<RuntimeSnapshot>(control, "snapshots");
  const snapshot = snapshots.find((item) => item.snapshot_id === terminal.snapshotId);
  expect(snapshot).toBeDefined();
  expect(snapshot?.diagnostics.some((item) => item.code === "EDIS_RUNTIME_SCREENSHOT_FAILED")).toBe(
    true,
  );
  const screenshots = await readStore(control, "screenshots");
  expect(screenshots).toHaveLength(0);
  await page.close();
});

async function captureInSession(
  controlPage: Page,
  page: Page,
  session: CaptureSession,
  label: string,
): Promise<RuntimeSnapshot> {
  const job = await startCapture(controlPage, page, session.data.session_id, { label });
  const terminal = await waitForJob(controlPage, job.id);
  expect(terminal.status).toBe("COMPLETE");
  const snapshots = await readStore<RuntimeSnapshot>(controlPage, "snapshots");
  const snapshot = snapshots.find((item) => item.snapshot_id === terminal.snapshotId);
  if (!snapshot) throw new Error("Runtime snapshot was not found.");
  return snapshot;
}

function expectNear(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function semanticDifference(left: string, right: string): string {
  const maximum = Math.max(left.length, right.length);
  for (let index = 0; index < maximum; index += 1)
    if (left[index] !== right[index])
      return `Semantic artifacts differ at byte ${index}: ${left.slice(index, index + 120)} != ${right.slice(index, index + 120)}`;
  return "Semantic artifacts differ in length.";
}
