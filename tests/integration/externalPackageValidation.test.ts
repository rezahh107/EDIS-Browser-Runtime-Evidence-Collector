import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/domain/canonical";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { validateEvidencePackageArchive } from "../../src/infrastructure/externalPackageValidation";
import { createStoreZip } from "../../src/infrastructure/zip";
import { parseStoreZip } from "../../src/infrastructure/zipReader";
import { makeSession, makeSnapshot } from "../helpers/fixtures";

describe("external package validation", () => {
  it("resolves every artifact schema only through embedded schema_id and schema-index", async () => {
    const built = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const result = await validateEvidencePackageArchive(built.bytes);
    expect(result.validation_state).toBe("PASS");
    expect(result.artifact_count).toBeGreaterThan(0);
    expect(result.schema_id_resolution_count).toBe(result.artifact_count);
    expect(result.schema_count).toBeGreaterThanOrEqual(18);
  });

  it("fails closed when an artifact declares an unregistered schema identifier", async () => {
    const built = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const entries = parseStoreZip(built.bytes).map((entry) => ({
      path: entry.path,
      data: entry.bytes,
    }));
    const target = entries.find((entry) => entry.path === "diagnostics/diagnostics.json");
    if (!target) throw new Error("Diagnostics artifact is missing.");
    const value = JSON.parse(new TextDecoder().decode(target.data)) as Record<string, unknown>;
    target.data = new TextEncoder().encode(
      canonicalJson({ ...value, schema_id: "urn:edis:schema:browser:unregistered" }),
    );
    const result = await validateEvidencePackageArchive(createStoreZip(entries));
    expect(result.validation_state).toBe("FAIL");
    expect(result.issues[0]).toMatch(/not registered/i);
  });

  it("fails closed when runtime Elementor metric invariants are contradictory", async () => {
    const built = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const entries = parseStoreZip(built.bytes).map((entry) => ({
      path: entry.path,
      data: entry.bytes,
    }));
    const target = entries.find((entry) => entry.path.endsWith("/snapshot.json"));
    if (!target) throw new Error("Runtime snapshot artifact is missing.");
    const value = JSON.parse(new TextDecoder().decode(target.data)) as {
      data: { document_metrics: Record<string, unknown> };
    };
    value.data.document_metrics = {
      ...value.data.document_metrics,
      discovered_elementor_elements: 2,
      emitted_elementor_elements: 1,
      skipped_elementor_elements: 0,
    };
    target.data = new TextEncoder().encode(canonicalJson(value));

    const result = await validateEvidencePackageArchive(createStoreZip(entries));
    expect(result.validation_state).toBe("FAIL");
    expect(result.issues[0]).toMatch(/EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION/);
  });

  it("fails closed when observation-set references disagree with snapshot artifacts", async () => {
    const built = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const entries = parseStoreZip(built.bytes).map((entry) => ({
      path: entry.path,
      data: entry.bytes,
    }));
    const target = entries.find((entry) => entry.path === "observation-set.json");
    if (!target) throw new Error("Observation-set artifact is missing.");
    const value = JSON.parse(new TextDecoder().decode(target.data)) as {
      data: { observations: Array<Record<string, unknown>> };
    };
    const first = value.data.observations[0];
    if (!first) throw new Error("Observation fixture is missing.");
    value.data.observations[0] = {
      ...first,
      snapshot_path: "observations/observation-9999/snapshot.json",
    };
    target.data = new TextEncoder().encode(canonicalJson(value));

    const result = await validateEvidencePackageArchive(createStoreZip(entries));
    expect(result.validation_state).toBe("FAIL");
    expect(result.issues[0]).toMatch(/EDIS_RUNTIME_ORPHAN_SNAPSHOT/);
  });
});
