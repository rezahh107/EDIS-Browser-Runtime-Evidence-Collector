import { describe, expect, it } from "vitest";
import { makeExportPreflightViewState } from "../../src/sidepanel/exportPreflightView";

describe("export preflight view state", () => {
  it("separates blockers from warnings and exposes the runtime fallback", () => {
    expect(
      makeExportPreflightViewState({
        blockingErrors: ["EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS"],
        warnings: ["SCREENSHOT_NOT_REQUESTED"],
        runtimeEvidenceFallbackAvailable: true,
      }),
    ).toEqual({
      hasBlockers: true,
      showWarnings: true,
      confirmDisabled: true,
      showRuntimeFallback: true,
      blockingMessageKey: "preflightBlockingWithRuntimeFallback",
    });
  });

  it("does not offer fallback when ordinary runtime export is blocked", () => {
    expect(
      makeExportPreflightViewState({
        blockingErrors: ["NO_RUNTIME_OBSERVATIONS"],
        warnings: [],
        runtimeEvidenceFallbackAvailable: false,
      }),
    ).toEqual({
      hasBlockers: true,
      showWarnings: false,
      confirmDisabled: true,
      showRuntimeFallback: false,
      blockingMessageKey: "preflightBlockingNoFallback",
    });
  });
});
