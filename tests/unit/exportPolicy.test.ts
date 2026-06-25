import { describe, expect, it } from "vitest";
import {
  isExportPurposeAllowed,
  isRuntimeEvidenceFallbackAvailable,
} from "../../src/domain/exportPolicy";

describe("export purpose policy", () => {
  it("allows the one-way minimum-feed to runtime-evidence downgrade", () => {
    expect(isExportPurposeAllowed("MINIMUM_PYTHON_FEED", "MINIMUM_PYTHON_FEED")).toBe(true);
    expect(isExportPurposeAllowed("MINIMUM_PYTHON_FEED", "RUNTIME_EVIDENCE")).toBe(true);
  });

  it("treats a legacy null workflow mode as runtime-evidence only", () => {
    expect(isExportPurposeAllowed(null, "RUNTIME_EVIDENCE")).toBe(true);
    expect(isExportPurposeAllowed(null, "MINIMUM_PYTHON_FEED")).toBe(false);
  });

  it("does not upgrade a runtime-evidence session into a minimum Python feed", () => {
    expect(isExportPurposeAllowed("RUNTIME_EVIDENCE", "RUNTIME_EVIDENCE")).toBe(true);
    expect(isExportPurposeAllowed("RUNTIME_EVIDENCE", "MINIMUM_PYTHON_FEED")).toBe(false);
  });

  it("offers fallback only when ordinary runtime export has no blockers", () => {
    expect(
      isRuntimeEvidenceFallbackAvailable({
        workflowMode: "MINIMUM_PYTHON_FEED",
        requestedPurpose: "MINIMUM_PYTHON_FEED",
        runtimeBlockingErrors: [],
      }),
    ).toBe(true);
    expect(
      isRuntimeEvidenceFallbackAvailable({
        workflowMode: "MINIMUM_PYTHON_FEED",
        requestedPurpose: "MINIMUM_PYTHON_FEED",
        runtimeBlockingErrors: ["NO_RUNTIME_OBSERVATIONS"],
      }),
    ).toBe(false);

    expect(
      isRuntimeEvidenceFallbackAvailable({
        workflowMode: "RUNTIME_EVIDENCE",
        requestedPurpose: "MINIMUM_PYTHON_FEED",
        runtimeBlockingErrors: [],
      }),
    ).toBe(false);
    expect(
      isRuntimeEvidenceFallbackAvailable({
        workflowMode: null,
        requestedPurpose: "MINIMUM_PYTHON_FEED",
        runtimeBlockingErrors: [],
      }),
    ).toBe(false);
  });
});
