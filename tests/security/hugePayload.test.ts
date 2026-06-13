import { describe, expect, it } from "vitest";
import { ChunkAssembler } from "../../src/application/chunkAssembler";
import { validatePayload } from "../../src/domain/validation";

describe("bounded payload denial-of-service resistance", () => {
  it("rejects oversized chunks and excessive totals", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(validatePayload("CONTENT_CHUNK", { jobId: id, index: 0, total: 10001, data: "x" })).toBe(
      false,
    );
    const assembler = new ChunkAssembler(1);
    expect(() => assembler.add(0, "x".repeat(524_289))).toThrow(/limit/);
  });
});
