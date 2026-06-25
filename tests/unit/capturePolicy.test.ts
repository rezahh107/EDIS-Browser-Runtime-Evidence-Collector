import { describe, expect, it } from "vitest";
import { effectiveSessionWorkflowMode } from "../../src/domain/capturePolicy";

describe("capture workflow policy", () => {
  it("leaves an empty legacy session selectable before its first capture", () => {
    expect(effectiveSessionWorkflowMode(null, 0)).toBeNull();
  });

  it("treats a legacy session with existing captures as runtime-evidence only", () => {
    expect(effectiveSessionWorkflowMode(null, 1)).toBe("RUNTIME_EVIDENCE");
  });

  it("preserves an explicitly recorded workflow mode", () => {
    expect(effectiveSessionWorkflowMode("MINIMUM_PYTHON_FEED", 3)).toBe("MINIMUM_PYTHON_FEED");
  });
});
