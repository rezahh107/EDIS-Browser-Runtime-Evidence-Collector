import { describe, expect, it } from "vitest";
import { validatePayload } from "../../src/domain/validation";
import { makeCaptureStartPayload } from "../e2e/harness";
import { sessionId } from "../helpers/fixtures";

describe("E2E CAPTURE_START payload", () => {
  it("uses ordinary Runtime Evidence defaults and satisfies production validation", () => {
    const payload = makeCaptureStartPayload(sessionId);

    expect(payload).toMatchObject({
      sessionId,
      userLabel: "E2E viewport",
      evidenceLabel: "USER_LABELED_VIEWPORT",
      requestedProfileId: "DESKTOP",
      workflowMode: "RUNTIME_EVIDENCE",
      overrides: {},
    });
    expect(validatePayload("CAPTURE_START", payload)).toBe(true);
  });

  it("preserves explicit profile, workflow, intent, and preference overrides", () => {
    const payload = makeCaptureStartPayload(sessionId, {
      requestedProfileId: "MOBILE",
      workflowMode: "MINIMUM_PYTHON_FEED",
      captureIntent: "RESPONSIVE_COMPARISON",
      screenshot: true,
    });

    expect(payload).toMatchObject({
      requestedProfileId: "MOBILE",
      workflowMode: "MINIMUM_PYTHON_FEED",
      captureIntent: "RESPONSIVE_COMPARISON",
      overrides: { includeScreenshot: true },
    });
    expect(validatePayload("CAPTURE_START", payload)).toBe(true);
  });
});
