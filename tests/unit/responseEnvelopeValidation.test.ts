import { describe, expect, it } from "vitest";
import { ResponseEnvelopeError, validateResponseEnvelope } from "../../src/domain/messages";

const requestId = "123e4567-e89b-42d3-a456-426614174000";

describe("response envelope validation", () => {
  it("accepts only correlated success and error envelopes", () => {
    expect(
      validateResponseEnvelope<{ ok: boolean }>(
        { requestId, success: true, data: { ok: true } },
        requestId,
      ),
    ).toEqual({
      requestId,
      success: true,
      data: { ok: true },
    });
    expect(
      validateResponseEnvelope(
        {
          requestId,
          success: false,
          error: { code: "EDIS_RUNTIME_MESSAGE_REJECTED", message: "Rejected." },
        },
        requestId,
      ),
    ).toMatchObject({ success: false });
  });

  it("rejects malformed or mis-correlated background responses as actionable canonical errors", () => {
    for (const value of [
      null,
      { requestId, success: true },
      { requestId, success: true, data: {}, extra: true },
      { requestId: "223e4567-e89b-42d3-a456-426614174000", success: true, data: {} },
      { requestId, success: false, error: { code: "x", message: "bad" } },
    ]) {
      expect(() => validateResponseEnvelope(value, requestId)).toThrow(ResponseEnvelopeError);
    }
  });
});
