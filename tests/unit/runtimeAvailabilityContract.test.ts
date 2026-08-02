import { describe, expect, it } from "vitest";
import runtimeSnapshotSchema from "../../schemas/runtime-snapshot.schema.json";
import { RUNTIME_AVAILABILITIES, isRuntimeAvailability } from "../../src/domain/model";

describe("runtime availability contract", () => {
  it("keeps the runtime inventory identical to capture readiness schema availability", () => {
    const schemaAvailability =
      runtimeSnapshotSchema.properties.data.properties.capture_readiness.properties.availability
        .enum;

    expect(RUNTIME_AVAILABILITIES).toEqual(schemaAvailability);
    expect(RUNTIME_AVAILABILITIES.every(isRuntimeAvailability)).toBe(true);
    expect(isRuntimeAvailability("UNKNOWN_RUNTIME_AVAILABILITY")).toBe(false);
  });
});
