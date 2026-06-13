import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/infrastructure/checksum";

describe("checksum generation", () => {
  it("produces the known SHA-256 for abc", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
