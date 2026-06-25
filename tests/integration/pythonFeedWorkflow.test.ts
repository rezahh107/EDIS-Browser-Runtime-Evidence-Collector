import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/domain/canonical";
import type {
  CaptureSession,
  ImportedSourceContext,
  RequestedViewportProfile,
  RuntimeSnapshot,
  SourceContextReference,
} from "../../src/domain/model";
import { evaluatePythonFeedReadiness } from "../../src/domain/pythonFeed";
import { sha256Digest } from "../../src/infrastructure/checksum";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { parseStoreZip } from "../../src/infrastructure/zipReader";
import { capturedAt, hashA, hashB, makeSession, makeSnapshot } from "../helpers/fixtures";

const profileData: readonly {
  readonly profile: RequestedViewportProfile;
  readonly width: number;
  readonly height: number;
  readonly snapshotId: string;
}[] = [
  {
    profile: "DESKTOP",
    width: 1440,
    height: 900,
    snapshotId: "423e4567-e89b-42d3-a456-426614174000",
  },
  {
    profile: "TABLET",
    width: 768,
    height: 1024,
    snapshotId: "523e4567-e89b-42d3-a456-426614174000",
  },
  {
    profile: "MOBILE",
    width: 390,
    height: 844,
    snapshotId: "623e4567-e89b-42d3-a456-426614174000",
  },
];

describe("minimum Python feed workflow", () => {
  it("keeps a runtime-only single observation exportable while marking the Python feed insufficient", async () => {
    const session = makeSession();
    const snapshot = makeSnapshot();
    const readiness = await evaluatePythonFeedReadiness({
      session,
      snapshots: [snapshot],
      sourceContext: null,
    });

    expect(readiness.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(readiness.export_allowed).toBe(false);
    expect(readiness.blocking_codes).toEqual(
      expect.arrayContaining([
        "EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED",
        "EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS",
        "EDIS_RUNTIME_INSUFFICIENT_DISTINCT_VIEWPORTS",
        "EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING",
      ]),
    );

    const runtimePackage = await buildEvidencePackage({
      session,
      snapshots: [snapshot],
      screenshots: [],
      purpose: "RUNTIME_EVIDENCE",
    });
    expect(runtimePackage.filename).toMatch(/^edis-runtime-package-/);
  });

  it("exports an insufficient minimum-feed session as ordinary runtime evidence without changing facts", async () => {
    const baseSession = makeSession();
    const session: CaptureSession = {
      ...baseSession,
      data: { ...baseSession.data, workflow_mode: "MINIMUM_PYTHON_FEED" },
    };
    const snapshot = makeSnapshot();

    const runtimePackage = await buildEvidencePackage({
      session,
      snapshots: [snapshot],
      screenshots: [],
      purpose: "RUNTIME_EVIDENCE",
    });
    expect(runtimePackage.filename).toMatch(/^edis-runtime-package-/);
    const paths = parseStoreZip(runtimePackage.bytes).map((entry) => entry.path);
    expect(paths).not.toContain("source-context/wordpress-source-context.json");
  });

  it("keeps a legacy null-mode session runtime-only even when feed readiness is complete", async () => {
    const fixture = await makeReadyFixture();
    const legacySession: CaptureSession = {
      ...fixture.session,
      data: { ...fixture.session.data, workflow_mode: null },
    };

    await expect(
      buildEvidencePackage({
        session: legacySession,
        snapshots: fixture.snapshots,
        screenshots: [],
        purpose: "MINIMUM_PYTHON_FEED",
        sourceContext: fixture.sourceContext,
      }),
    ).rejects.toThrow("EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH");

    const runtimePackage = await buildEvidencePackage({
      session: legacySession,
      snapshots: fixture.snapshots,
      screenshots: [],
      purpose: "RUNTIME_EVIDENCE",
    });
    expect(runtimePackage.filename).toMatch(/^edis-runtime-package-/);
  });

  it("rejects upgrading a runtime-evidence session to a minimum Python feed", async () => {
    const fixture = await makeReadyFixture();
    const runtimeSession: CaptureSession = {
      ...fixture.session,
      data: { ...fixture.session.data, workflow_mode: "RUNTIME_EVIDENCE" },
    };
    await expect(
      buildEvidencePackage({
        session: runtimeSession,
        snapshots: fixture.snapshots,
        screenshots: [],
        purpose: "MINIMUM_PYTHON_FEED",
        sourceContext: fixture.sourceContext,
      }),
    ).rejects.toThrow("EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH");
  });

  it("exports a self-contained minimum Python feed only with confirmed source and three distinct profiles", async () => {
    const fixture = await makeReadyFixture();
    const readiness = await evaluatePythonFeedReadiness(fixture);
    expect(readiness).toMatchObject({
      state: "READY",
      export_allowed: true,
      source_context_present: true,
      source_context_confirmed: true,
      source_context_hash_matches: true,
      observation_count: 3,
      distinct_viewport_width_count: 3,
      missing_required_profiles: [],
      page_fingerprint_consistent: true,
      source_context_reference_consistent: true,
      blocking_codes: [],
    });

    const result = await buildEvidencePackage({
      session: fixture.session,
      snapshots: fixture.snapshots,
      screenshots: [],
      purpose: "MINIMUM_PYTHON_FEED",
      sourceContext: fixture.sourceContext,
    });
    expect(result.filename).toMatch(/^edis-python-feed-/);
    const paths = parseStoreZip(result.bytes).map((entry) => entry.path);
    expect(paths).toContain("source-context/wordpress-source-context.json");
    expect(paths).toContain("validation/python-feed-readiness.json");
  });

  it("rejects a minimum feed when observations describe different runtime pages", async () => {
    const fixture = await makeReadyFixture();
    const snapshots = fixture.snapshots.map((snapshot, index) =>
      index === 2
        ? {
            ...snapshot,
            page: { ...snapshot.page, page_fingerprint: hashA },
          }
        : snapshot,
    );
    const readiness = await evaluatePythonFeedReadiness({ ...fixture, snapshots });
    expect(readiness.state).toBe("INVALID");
    expect(readiness.blocking_codes).toContain("EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH");
    await expect(
      buildEvidencePackage({
        session: fixture.session,
        snapshots,
        screenshots: [],
        purpose: "MINIMUM_PYTHON_FEED",
        sourceContext: fixture.sourceContext,
      }),
    ).rejects.toThrow("EDIS_RUNTIME_PYTHON_FEED_NOT_READY");
  });
});

async function makeReadyFixture(): Promise<{
  readonly session: CaptureSession;
  readonly snapshots: readonly RuntimeSnapshot[];
  readonly sourceContext: ImportedSourceContext;
}> {
  const sourceContext: ImportedSourceContext = {
    schema_id: "urn:edis:schema:wordpress:bridge-context",
    schema_version: "1.0.0",
    artifact_type: "edis_source_context",
    producer: { product: "EDIS WordPress Evidence Exporter", version: "1.0.0" },
    captured_at: capturedAt,
    canonicalization: { profile: "EDIS-CJ-1", hash_algorithm: "sha256" },
    data: {
      analysis_set_id: "723e4567-e89b-42d3-a456-426614174000",
      wordpress_bundle_id: "823e4567-e89b-42d3-a456-426614174000",
      source_export_root_sha256: hashA,
      site_fingerprint: hashB,
      url_normalization_profile: "EDIS-URL-1",
      site_locator_candidates: [],
      multisite_mode: "SINGLE_SITE",
      site_path_scope: "/",
      source_truth_state: "VERIFIED",
      source_availability: "AVAILABLE",
      documents: [
        {
          document_id: "42",
          document_type: "page",
          document_fingerprint: hashB,
          saved_source_sha256: hashA,
          page_locator_candidates: [],
          public_routability: "PUBLIC",
          source_storage_kind: "POST_META",
          source_state: "PUBLISHED",
          architecture_kinds: ["legacy"],
          source_truth_state: "VERIFIED",
          source_availability: "AVAILABLE",
          elements: [],
        },
      ],
    },
    diagnostics: [],
  };
  const importedHash = await sha256Digest(new TextEncoder().encode(canonicalJson(sourceContext)));
  const reference: SourceContextReference = {
    analysis_set_id: sourceContext.data.analysis_set_id,
    wordpress_bundle_id: sourceContext.data.wordpress_bundle_id,
    imported_source_context_sha256: importedHash,
    source_export_root_sha256: sourceContext.data.source_export_root_sha256,
    site_fingerprint: sourceContext.data.site_fingerprint,
    selected_document_id: "42",
    selected_document_fingerprint: hashB,
    confirmation_state: "CONFIRMED",
  };

  const baseSnapshot = makeSnapshot();
  const snapshots = profileData.map(
    (item, observationIndex): RuntimeSnapshot => ({
      ...baseSnapshot,
      snapshot_id: item.snapshotId,
      observation_index: observationIndex,
      source_context_reference: reference,
      viewport: {
        ...baseSnapshot.viewport,
        inner_width: item.width,
        inner_height: item.height,
        user_label: item.profile,
        requested_profile_id: item.profile,
      },
    }),
  );
  const baseSession = makeSession();
  const baseCapture = baseSession.data.captures[0];
  if (!baseCapture) throw new Error("Missing base capture fixture.");
  const session: CaptureSession = {
    ...baseSession,
    data: {
      ...baseSession.data,
      source_context_reference: reference,
      source_binding_state: "PROBABLE",
      workflow_mode: "MINIMUM_PYTHON_FEED",
      captures: snapshots.map((snapshot) => ({
        ...baseCapture,
        snapshot_id: snapshot.snapshot_id,
        label: snapshot.viewport.user_label,
        actual_width: snapshot.viewport.inner_width,
        actual_height: snapshot.viewport.inner_height,
      })),
    },
  };
  return { session, snapshots, sourceContext };
}
