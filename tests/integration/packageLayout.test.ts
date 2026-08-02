import { describe, expect, it } from "vitest";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { parseStoreZip } from "../e2e/zip";
import { makeSession, makeSnapshot } from "../helpers/fixtures";

interface RuntimeContextFixture {
  readonly diagnostics: readonly {
    readonly code: string;
    readonly context: Readonly<
      Record<string, string | number | boolean | null | readonly string[]>
    >;
  }[];
}

describe("runtime package 1.4.0 layout", () => {
  it("emits only declared non-empty artifacts in deterministic path order", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const paths = parseStoreZip(result.bytes).map((entry) => entry.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain("package-manifest.json");
    expect(paths).toContain("checksums.sha256");
    expect(paths).toContain("README.txt");
    expect(paths).toContain("observation-set.json");
    expect(paths).toContain("context/runtime-context.json");
    expect(paths).toContain("coverage/runtime-coverage.json");
    expect(paths).toContain("coverage/evidence-coverage.json");
    expect(paths).toContain("coverage/source-binding-coverage.json");
    expect(paths).toContain("coverage/source-runtime-cardinality.json");
    expect(paths).toContain("observations/observation-0001/snapshot.json");
    expect(paths).toContain("diagnostics/diagnostics.json");
    expect(paths).toContain("structure/page-structure-summary.json");
    expect(paths).toContain("validation/package-validation.json");
    expect(paths.some((path) => path.endsWith("screenshot.png"))).toBe(false);
    expect(paths.some((path) => path.includes("context/source-context-reference"))).toBe(false);
    expect(paths).not.toContain("session.json");
    expect(paths).not.toContain("manifest.json");
    expect(paths).not.toContain("validation.json");
  });

  it("records non-sensitive runtime export provenance diagnostics", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const entries = new Map(parseStoreZip(result.bytes).map((entry) => [entry.path, entry.bytes]));
    const runtimeContextBytes = entries.get("context/runtime-context.json");
    if (!runtimeContextBytes) throw new Error("runtime-context.json missing from package");
    const runtimeContext = JSON.parse(decoder.decode(runtimeContextBytes)) as RuntimeContextFixture;
    const provenance = runtimeContext.diagnostics.find(
      (item) => item.code === "EDIS_RUNTIME_EXPORT_PROVENANCE",
    );
    if (!provenance) throw new Error("Runtime provenance diagnostic missing");
    expect(provenance.context.collector_engine_version).toBe("1.6.20");
    expect(provenance.context.extension_release_version).toBe("1.6.20");
    expect(provenance.context.indexeddb_name).toBe("edis-runtime-collector");
    expect(provenance.context.indexeddb_version).toBe(4);
    expect(provenance.context.extension_zip_sha256_status).toBe("UNAVAILABLE_AT_RUNTIME");
  });

  it("rejects non-contiguous observation indexes", async () => {
    const snapshot = { ...makeSnapshot(), observation_index: 2 };
    await expect(
      buildEvidencePackage({ session: makeSession(), snapshots: [snapshot], screenshots: [] }),
    ).rejects.toThrow(/observation indexes/i);
  });

  it("rejects contradictory Elementor metrics before package creation", async () => {
    const snapshot = makeSnapshot();
    const invalid = {
      ...snapshot,
      document_metrics: {
        ...snapshot.document_metrics,
        discovered_elementor_elements: 1,
        emitted_elementor_elements: 2,
        skipped_elementor_elements: 0,
      },
    };
    await expect(
      buildEvidencePackage({ session: makeSession(), snapshots: [invalid], screenshots: [] }),
    ).rejects.toThrow(/EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION/);
  });

  it("rejects a session summary that references a missing snapshot", async () => {
    const session = makeSession();
    const base = session.data.captures[0];
    if (!base) throw new Error("Capture summary fixture is missing.");
    const extra = {
      ...base,
      snapshot_id: "323e4567-e89b-42d3-a456-426614174099",
      captured_at: "2026-06-13T10:00:10.000Z",
    };
    const invalidSession = {
      ...session,
      data: { ...session.data, captures: [base, extra] },
    };
    await expect(
      buildEvidencePackage({
        session: invalidSession,
        snapshots: [makeSnapshot()],
        screenshots: [],
      }),
    ).rejects.toThrow(/EDIS_RUNTIME_MISSING_SNAPSHOT/);
  });
});
