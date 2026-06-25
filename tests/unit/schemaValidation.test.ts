import { describe, expect, it } from "vitest";
import { isRfc3339DateTime, validateJsonSchema } from "../../src/infrastructure/schemaValidation";

describe("embedded JSON Schema validation hardening", () => {
  it("enforces uniqueItems for primitive and structured values", () => {
    const registry = {
      "unique.schema.json": {
        type: "array",
        uniqueItems: true,
      },
    } as const;

    expect(validateJsonSchema(["a", "b"], "unique.schema.json", registry)).toEqual([]);
    expect(validateJsonSchema(["a", "a"], "unique.schema.json", registry)).toEqual([
      { path: "$[1]", message: "Array items must be unique." },
    ]);
    expect(validateJsonSchema([{ key: 1 }, { key: 1 }], "unique.schema.json", registry)).toEqual([
      { path: "$[1]", message: "Array items must be unique." },
    ]);
  });

  it("rejects date-only, impossible, and offset-invalid values as RFC3339 date-times", () => {
    for (const invalid of [
      "2026-06-15",
      "2026-02-30T12:00:00Z",
      "2026-06-15T24:00:00Z",
      "2026-06-15T12:60:00Z",
      "2026-06-15T12:00:60Z",
      "2026-06-15T12:00:00+24:00",
    ]) {
      expect(isRfc3339DateTime(invalid), invalid).toBe(false);
    }

    for (const valid of [
      "2026-06-15T12:00:00Z",
      "2026-06-15T12:00:00.123Z",
      "2026-06-15T12:00:00+03:30",
      "2024-02-29T23:59:59-04:00",
    ]) {
      expect(isRfc3339DateTime(valid), valid).toBe(true);
    }
  });

  it("applies strict date-time validation through the schema format keyword", () => {
    const registry = {
      "time.schema.json": { type: "string", format: "date-time" },
    } as const;
    expect(validateJsonSchema("2026-06-15", "time.schema.json", registry)).toEqual([
      { path: "$", message: "String is not an RFC3339 date-time." },
    ]);
    expect(validateJsonSchema("2026-06-15T12:00:00Z", "time.schema.json", registry)).toEqual([]);
  });
});
