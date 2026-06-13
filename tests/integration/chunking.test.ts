import { describe, expect, it } from "vitest";
import { ChunkAssembler } from "../../src/application/chunkAssembler";

describe("chunking to durable buffer contract", () => {
  it("assembles out-of-order chunks deterministically", () => {
    const assembler = new ChunkAssembler(3);
    assembler.add(2, "c");
    assembler.add(0, "a");
    assembler.add(1, "b");
    expect(assembler.complete).toBe(true);
    expect(assembler.assemble()).toBe("abc");
  });

  it("rejects conflicting duplicates", () => {
    const assembler = new ChunkAssembler(1);
    assembler.add(0, "a");
    expect(() => assembler.add(0, "b")).toThrow(/Conflicting/);
  });
});
