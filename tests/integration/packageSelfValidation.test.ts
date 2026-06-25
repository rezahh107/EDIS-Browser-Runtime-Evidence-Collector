import { describe, expect, it } from "vitest";
import { diagnostic } from "../../src/domain/diagnostics";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { parseStoreZip } from "../e2e/zip";
import { makeSession, makeSnapshot } from "../helpers/fixtures";

function parseEntry(bytes: Uint8Array, path: string): Record<string, unknown> {
  const entry = parseStoreZip(bytes).find((item) => item.path === path);
  if (!entry) throw new Error(`Missing ZIP entry: ${path}`);
  return JSON.parse(new TextDecoder().decode(entry.bytes)) as Record<string, unknown>;
}

describe("package self-validation", () => {
  it("exports validation evidence and separates integrity from partial coverage", async () => {
    const base = makeSnapshot();
    const partial = {
      ...base,
      status: "PARTIAL" as const,
      capture_completeness: {
        ...base.capture_completeness,
        status: "PARTIAL" as const,
        reasons: ["EDIS_RUNTIME_DEPTH_LIMIT_REACHED"],
        truncated_branch_count: 2,
      },
      document_metrics: { ...base.document_metrics, truncated_branch_count: 2 },
    };
    const session = makeSession();
    const patchedSession = {
      ...session,
      data: {
        ...session.data,
        status: "PARTIAL" as const,
        captures: session.data.captures.map((capture) => ({
          ...capture,
          status: "PARTIAL" as const,
          completeness_status: "PARTIAL" as const,
          partial_reasons: ["EDIS_RUNTIME_DEPTH_LIMIT_REACHED"],
          truncated_branch_count: 2,
        })),
      },
    };
    const result = await buildEvidencePackage({
      session: patchedSession,
      snapshots: [partial],
      screenshots: [],
    });

    const validation = parseEntry(result.bytes, "validation/package-validation.json");
    const manifest = parseEntry(result.bytes, "package-manifest.json");
    expect((validation.data as Record<string, unknown>).schema_validation).toBe("PASS");
    expect((validation.data as Record<string, unknown>).capture_completeness).toBe("PARTIAL");
    expect((manifest.data as Record<string, unknown>).package_validation_state).toBe("PASS");
    expect((manifest.data as Record<string, unknown>).capture_completeness).toBe("PARTIAL");
  });

  it("stores diagnostics once in the payload and leaves envelope diagnostics empty", async () => {
    const base = makeSnapshot();
    const warning = diagnostic(
      "EDIS_RUNTIME_READINESS_UNSTABLE",
      "WARNING",
      "Fixture warning",
      true,
      { incomplete_image_count_in_viewport: 1 },
    );
    const snapshot = { ...base, diagnostics: [warning] };
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [snapshot],
      screenshots: [],
    });

    const artifact = parseEntry(result.bytes, "diagnostics/diagnostics.json");
    expect(artifact.schema_id).toBe("urn:edis:schema:browser:diagnostics-artifact");
    expect(artifact.diagnostics).toEqual([]);
    const exported = (artifact.data as { diagnostics: Array<{ code?: string }> }).diagnostics;
    expect(exported).toContainEqual(warning);
    expect(exported.some((item) => item.code === "EDIS_RUNTIME_SINGLE_VIEWPORT_ONLY")).toBe(true);
  });

  it("blocks an obsolete snapshot schema before export", async () => {
    const invalid = { ...makeSnapshot(), schema_version: "1.0.0" };
    await expect(
      buildEvidencePackage({
        session: makeSession(),
        snapshots: [invalid as never],
        screenshots: [],
      }),
    ).rejects.toThrow(/runtime validation/i);
  });

  it("reports exact schema-validation and canonical JSON inventories", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const entries = parseStoreZip(result.bytes);
    const paths = entries.map((item) => item.path);
    const artifactJsonPaths = paths.filter(
      (path) => path.endsWith(".json") && !path.startsWith("schemas/"),
    );
    const schemaPaths = paths.filter(
      (path) => path.startsWith("schemas/") && path.endsWith(".json"),
    );
    const validation = parseEntry(result.bytes, "validation/package-validation.json");
    const data = validation.data as Record<string, unknown>;
    expect(data.validated_json_files).toBe(artifactJsonPaths.length);
    expect(data.artifact_json_files).toBe(artifactJsonPaths.length);
    expect(data.embedded_schema_files).toBe(schemaPaths.length);
    expect(data.canonical_json_files).toBe(artifactJsonPaths.length + schemaPaths.length);
    expect(data.schema_validated_artifact_paths).toEqual([...artifactJsonPaths].sort());
    expect(data.schema_unvalidated_artifact_paths).toEqual([]);
  });
});
