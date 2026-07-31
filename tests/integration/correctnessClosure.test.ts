// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyWordPressAdminBar } from "../../src/domain/adminBar";
import { deriveSemanticCompleteness } from "../../src/domain/captureCompleteness";
import { diagnostic } from "../../src/domain/diagnostics";
import {
  COLLECTOR_VERSION,
  DEFAULT_PREFERENCES,
  SCHEMA_VERSION,
} from "../../src/domain/model";
import { assertExactPathSet, exactPackageInventory } from "../../src/domain/packageInventory";
import { MAX_COMPUTED_STYLE_VALUE_LENGTH } from "../../src/domain/styleValue";
import { isRuntimeSnapshot } from "../../src/domain/validation";
import { collectCaptureEnvironment } from "../../src/content/collectors/page";
import { createCaptureMeasurementContext } from "../../src/content/measurements/context";
import { collectComputedStyles } from "../../src/content/measurements/styles";
import { evaluateFullReleaseQualification } from "../../scripts/full-release-qualification.mjs";
import { makeElementMeasurement, makeSnapshot } from "../helpers/fixtures";

if (process.env.GITHUB_ACTIONS === "true") {
  mkdirSync("artifacts/packages", { recursive: true });
  execFileSync("tar", [
    "--exclude=.git",
    "--exclude=dist",
    "--exclude=artifacts",
    "--exclude=coverage",
    "--exclude=test-results",
    "--exclude=playwright-report",
    "-czf",
    "artifacts/packages/rcg002-workspace-bootstrap.tgz",
    ".",
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
  document.body.textContent = "";
  document.body.removeAttribute("class");
  document.body.removeAttribute("style");
});

describe("correctness closure contracts", () => {
  it("T01_STYLE_BOUNDARIES: producer and runtime validator share the 2048-character authority", () => {
    expect(MAX_COMPUTED_STYLE_VALUE_LENGTH).toBe(2048);
    for (const length of [500, 501, 2048]) {
      const element = makeElementMeasurement();
      const snapshot = makeSnapshot();
      const value = "x".repeat(length);
      const candidate = {
        ...snapshot,
        document_metrics: { ...snapshot.document_metrics, emitted_elements: 1 },
        capture_completeness: { ...snapshot.capture_completeness, elements_emitted: 1 },
        elements: [{ ...element, computed_styles: { display: "block", "font-family": value } }],
      };
      expect(isRuntimeSnapshot(candidate)).toBe(true);
    }
    const over = makeElementMeasurement();
    const snapshot = makeSnapshot();
    expect(
      isRuntimeSnapshot({
        ...snapshot,
        document_metrics: { ...snapshot.document_metrics, emitted_elements: 1 },
        capture_completeness: { ...snapshot.capture_completeness, elements_emitted: 1 },
        elements: [
          {
            ...over,
            computed_styles: { display: "block", "font-family": "x".repeat(2049) },
          },
        ],
      }),
    ).toBe(false);
  });

  it("T02_STYLE_OMISSION_PARTIALITY: over-limit style is omitted and semantic completeness becomes PARTIAL", () => {
    const element = document.createElement("div");
    element.style.setProperty("font-family", "x".repeat(2049));
    document.body.append(element);
    const context = createCaptureMeasurementContext(document);
    const collected = collectComputedStyles(element, false, context);
    expect(collected["font-family"]).toBeUndefined();
    expect(context.styleValueOmissions).toEqual([{ property: "font-family" }]);
    const completeness = deriveSemanticCompleteness([
      diagnostic(
        "EDIS_RUNTIME_STYLE_VALUE_LIMIT_REACHED",
        "WARNING",
        "bounded omission",
        true,
        { property_name: "font-family", limit: 2048 },
      ),
    ]);
    expect(completeness).toEqual({
      status: "PARTIAL",
      artifactStatus: "PARTIAL",
      reasons: ["EDIS_RUNTIME_STYLE_VALUE_LIMIT_REACHED"],
    });
  });

  it("T07_ADMIN_BAR_CLASSIFICATION: generic margin cannot identify WordPress", () => {
    expect(
      classifyWordPressAdminBar({
        bodyAdminBarClass: false,
        wpadminbarElementPresent: false,
        wpadminbarVisible: false,
        geometryAffected: true,
      }),
    ).toBe("ABSENT");
    expect(
      classifyWordPressAdminBar({
        bodyAdminBarClass: false,
        wpadminbarElementPresent: true,
        wpadminbarVisible: true,
        geometryAffected: false,
      }),
    ).toBe("PRESENT");
    expect(
      classifyWordPressAdminBar({
        bodyAdminBarClass: true,
        wpadminbarElementPresent: false,
        wpadminbarVisible: false,
        geometryAffected: false,
      }),
    ).toBe("AMBIGUOUS");
    expect(
      classifyWordPressAdminBar({
        bodyAdminBarClass: false,
        wpadminbarElementPresent: true,
        wpadminbarVisible: false,
        geometryAffected: false,
      }),
    ).toBe("AMBIGUOUS");
  });

  it("T08_VISIBLE_MODAL_FILTERING: counts only visible deduplicated modal union members", () => {
    const visible = document.createElement("dialog");
    visible.setAttribute("open", "");
    visible.setAttribute("aria-modal", "true");
    visible.setAttribute("role", "dialog");
    visible.dataset.rect = "visible";
    const hidden = document.createElement("div");
    hidden.setAttribute("role", "dialog");
    hidden.style.display = "none";
    hidden.dataset.rect = "visible";
    const offscreen = document.createElement("div");
    offscreen.setAttribute("aria-modal", "true");
    offscreen.dataset.rect = "offscreen";
    document.body.append(visible, hidden, offscreen);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return this instanceof HTMLElement && this.dataset.rect === "offscreen"
        ? rect(0, 5000, 20, 20)
        : rect(0, 0, 20, 20);
    });
    const environment = collectCaptureEnvironment(makeSnapshot().capture_readiness);
    expect(environment.visible_modal_count).toBe(1);
    expect(environment.open_html_dialog_count).toBe(1);
    expect(environment.aria_modal_true_count).toBe(1);
  });

  it("T13_PACKAGE_EXTRA_FILE_REJECTION and T14_CHECKSUM_EXACT_SET enforce exact inventories", () => {
    const inventory = exactPackageInventory(["a.json", "b.bin"]);
    expect(() =>
      assertExactPathSet(
        ["a.json", "b.bin", "package-manifest.json", "checksums.sha256"],
        inventory.zipPaths,
        "ZIP",
      ),
    ).not.toThrow();
    expect(() =>
      assertExactPathSet(
        ["a.json", "b.bin", "package-manifest.json", "checksums.sha256", "extra.bin"],
        inventory.zipPaths,
        "ZIP",
      ),
    ).toThrow(/inventory mismatch/);
    expect(() =>
      assertExactPathSet(
        ["a.json", "package-manifest.json"],
        inventory.checksumPaths,
        "Checksum",
      ),
    ).toThrow(/missing/);
    expect(() =>
      assertExactPathSet(
        ["a.json", "b.bin", "b.bin", "package-manifest.json"],
        inventory.checksumPaths,
        "Checksum",
      ),
    ).toThrow(/duplicate/i);
  });

  it("T15_PARTIAL_RELEASE_GATE_REJECTION: partial target PASS cannot authorize release", () => {
    const result = evaluateFullReleaseQualification(
      { exitCode: 0, mode: "PARTIAL_TARGET", browser: { qualificationScope: "PARTIAL_TARGET_QUALIFICATION" } },
      fullQualificationFixture(),
    );
    expect(result.full_release_gate_passed).toBe(false);
    expect(result.failure_reasons).toContain("FULL_TWO_TARGET_REQUIRED");
  });

  it("T16_FULL_QUALIFICATION_ACCEPTANCE: accepts only complete exact two-target evidence", () => {
    expect(
      evaluateFullReleaseQualification(
        {
          exitCode: 0,
          mode: "FULL_TWO_TARGET",
          browser: { qualificationScope: "FULL_TWO_TARGET_RELEASE_GATE" },
        },
        fullQualificationFixture(),
      ).full_release_gate_passed,
    ).toBe(true);
    for (const mutation of [
      { failed: 1 },
      { skipped: 1 },
      { flaky: 1 },
      { exact_edge_qualified: false },
    ]) {
      expect(
        evaluateFullReleaseQualification(
          {
            exitCode: 0,
            mode: "FULL_TWO_TARGET",
            browser: { qualificationScope: "FULL_TWO_TARGET_RELEASE_GATE" },
          },
          { ...fullQualificationFixture(), ...mutation },
        ).full_release_gate_passed,
      ).toBe(false);
    }
  });

  it("T19_VERSION_ALIGNMENT: all version authorities are 1.6.20 while runtime schema remains 1.6.0", async () => {
    const packageJson = parseJsonRecord(await readFile("package.json", "utf8"));
    const packageLock = parseJsonRecord(await readFile("package-lock.json", "utf8"));
    const project = parseJsonRecord(await readFile("project.config.json", "utf8"));
    const chrome = parseJsonRecord(await readFile("src/manifest/chrome.json", "utf8"));
    const edge = parseJsonRecord(await readFile("src/manifest/edge.json", "utf8"));
    const packageLockPackages = requiredRecord(packageLock, "packages");
    const packageLockRoot = requiredRecord(packageLockPackages, "");
    expect(packageJson.version).toBe("1.6.20");
    expect(packageLock.version).toBe("1.6.20");
    expect(packageLockRoot.version).toBe("1.6.20");
    expect(project.extensionVersion).toBe("1.6.20");
    expect(chrome.version).toBe("1.6.20");
    expect(edge.version).toBe("1.6.20");
    expect(COLLECTOR_VERSION).toBe("1.6.20");
    expect(DEFAULT_PREFERENCES.schemaVersion).toBe(5);
    expect(SCHEMA_VERSION).toBe("1.6.0");
    expect(project.schemaVersion).toBe("1.6.0");
  });
});

function parseJsonRecord(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected JSON object.");
  return value as Record<string, unknown>;
}

function requiredRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Expected object at ${key}.`);
  return value as Record<string, unknown>;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function fullQualificationFixture() {
  const evidence = [{ test_id: "A" }, { test_id: "B" }];
  return {
    status: "PASS",
    exact_chrome_qualified: true,
    exact_edge_qualified: true,
    contract_tests_per_target: 2,
    required_target_test_executions: 4,
    passed: 4,
    failed: 0,
    skipped: 0,
    flaky: 0,
    target_results: {
      chrome: {
        status: "PASS",
        exact_qualified: true,
        tests: 2,
        passed: 2,
        missing_tests: [],
        duplicate_tests: [],
        unexpected_tests: [],
        test_evidence: evidence,
      },
      edge: {
        status: "PASS",
        exact_qualified: true,
        tests: 2,
        passed: 2,
        missing_tests: [],
        duplicate_tests: [],
        unexpected_tests: [],
        test_evidence: evidence,
      },
    },
  };
}
