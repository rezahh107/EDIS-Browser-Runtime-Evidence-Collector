import { describe, expect, it } from "vitest";
import captureSessionSchema from "../../schemas/capture-session.schema.json";
import schemaIndex from "../../schemas/schema-index.json";
import schemaIndexSchema from "../../schemas/schema-index.schema.json";
import { COLLECTOR_VERSION, SCHEMA_VERSION } from "../../src/domain/model";
import { validateJsonSchema } from "../../src/infrastructure/schemaValidation";
import artifactEnvelopeSchema from "../../schemas/artifact-envelope.schema.json";
import diagnosticSchema from "../../schemas/diagnostic.schema.json";
import { makeSession } from "../helpers/fixtures";

const registry = {
  "artifact-envelope.schema.json": artifactEnvelopeSchema,
  "capture-session.schema.json": captureSessionSchema,
  "diagnostic.schema.json": diagnosticSchema,
  "schema-index.schema.json": schemaIndexSchema,
};

describe("independent schema and collector versioning", () => {
  it("uses runtime schema 1.6.0 and collector 1.6.19", () => {
    expect(SCHEMA_VERSION).toBe("1.6.0");
    expect(COLLECTOR_VERSION).toBe("1.6.19");
  });

  it("accepts semantic extension versions instead of one hard-coded release", () => {
    const session = makeSession();
    const futurePatch = {
      ...session,
      producer: { ...session.producer, version: "1.4.7" },
      data: { ...session.data, extension_version: "1.4.7" },
    };
    expect(validateJsonSchema(futurePatch, "capture-session.schema.json", registry)).toEqual([]);
  });

  it("rejects undeclared fields in the schema index", () => {
    const invalid = { ...schemaIndex, unexpected: true };
    expect(validateJsonSchema(invalid, "schema-index.schema.json", registry)).not.toEqual([]);
  });
});
