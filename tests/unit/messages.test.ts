import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../../src/domain/messages";
import { isBaseMessage, validatePayload } from "../../src/domain/validation";

const requestId = "123e4567-e89b-12d3-a456-426614174000";

describe("message schemas", () => {
  it("accepts a versioned allowlisted envelope", () => {
    expect(
      isBaseMessage({ protocolVersion: PROTOCOL_VERSION, type: "PAGE_CHECK", requestId }),
    ).toBe(true);
  });

  it("rejects unknown types, extra envelope keys, and malformed capture payloads", () => {
    expect(
      isBaseMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: "PAGE_CHECK",
        requestId,
        unexpected: true,
      }),
    ).toBe(false);
    expect(isBaseMessage({ protocolVersion: PROTOCOL_VERSION, type: "UNKNOWN", requestId })).toBe(
      false,
    );
    expect(
      validatePayload("CAPTURE_START", {
        sessionId: requestId,
        userLabel: "",
        evidenceLabel: "MOBILE",
      }),
    ).toBe(false);
  });

  it("accepts bounded chunk payloads", () => {
    expect(
      validatePayload("CONTENT_CHUNK", {
        jobId: requestId,
        index: 0,
        total: 1,
        data: "{}",
        sha256: "0".repeat(64),
        byteLength: 2,
      }),
    ).toBe(true);
    expect(
      validatePayload("CONTENT_CHUNK", {
        jobId: requestId,
        index: 0,
        total: 1,
        data: "x".repeat(524_289),
        sha256: "0".repeat(64),
        byteLength: 524_289,
      }),
    ).toBe(false);
  });
});
