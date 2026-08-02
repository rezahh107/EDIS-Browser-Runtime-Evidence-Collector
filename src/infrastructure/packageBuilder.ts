import artifactEnvelopeSchema from "../../schemas/artifact-envelope.schema.json";
import bridgeContextSchema from "../../schemas/bridge-context.schema.json";
import captureSessionSchema from "../../schemas/capture-session.schema.json";
import diagnosticSchema from "../../schemas/diagnostic.schema.json";
import diagnosticsArtifactSchema from "../../schemas/diagnostics-artifact.schema.json";
import evidenceCoverageSchema from "../../schemas/evidence-coverage.schema.json";
import observationSetSchema from "../../schemas/observation-set.schema.json";
import packageManifestSchema from "../../schemas/package-manifest.schema.json";
import packageValidationSchema from "../../schemas/package-validation.schema.json";
import pageStructureSummarySchema from "../../schemas/page-structure-summary.schema.json";
import pythonFeedReadinessSchema from "../../schemas/python-feed-readiness.schema.json";
import runtimeContextSchema from "../../schemas/runtime-context.schema.json";
import runtimeCoverageSchema from "../../schemas/runtime-coverage.schema.json";
import runtimeSnapshotSchema from "../../schemas/runtime-snapshot.schema.json";
import schemaIndex from "../../schemas/schema-index.json";
import schemaIndexSchema from "../../schemas/schema-index.schema.json";
import sourceBindingCoverageSchema from "../../schemas/source-binding-coverage.schema.json";
import sourceBindingEvidenceSchema from "../../schemas/source-binding-evidence.schema.json";
import sourceContextReferenceSchema from "../../schemas/source-context-reference.schema.json";
import sourceRuntimeCardinalitySchema from "../../schemas/source-runtime-cardinality.schema.json";
import { canonicalJson, compareCanonicalStrings, parseSafeJson } from "../domain/canonical";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import { assertElementorMetricInvariant } from "../domain/elementorMetrics";
import { makeEnvelope } from "../domain/envelope";
import { deterministicUuid } from "../domain/identifiers";
import { COLLECTOR_VERSION, RUNTIME_PACKAGE_SCHEMA_VERSION, SCHEMA_VERSION } from "../domain/model";
import { assertExactPathSet, exactPackageInventory } from "../domain/packageInventory";
import { isExportPurposeAllowed } from "../domain/exportPolicy";
import { evaluatePythonFeedReadiness, type ExportPurpose } from "../domain/pythonFeed";
import type {
  ArtifactEnvelope,
  CaptureSession,
  ImportedSourceContext,
  PackageValidationData,
  RuntimeAvailability,
  RuntimeSnapshot,
  ScreenshotRecord,
} from "../domain/model";
import { isRuntimeSnapshot, isScreenshotRecord } from "../domain/validation";
import { hasReadinessError } from "../domain/readinessState";
import { sha256Digest, sha256Hex } from "./checksum";
import { validateJsonSchema, type SchemaRegistry } from "./schemaValidation";
import { validateEvidencePackageArchive } from "./externalPackageValidation";
import {
  collectExtensionRuntimeProvenance,
  extensionProvenanceDiagnostic,
} from "./extensionProvenance";
import { createStoreZip, type ZipEntry } from "./zip";

export interface EvidencePackageInput {
  readonly session: CaptureSession;
  readonly snapshots: readonly RuntimeSnapshot[];
  readonly screenshots: readonly ScreenshotRecord[];
  readonly purpose?: ExportPurpose;
  readonly sourceContext?: ImportedSourceContext | null;
}

export interface BuiltEvidencePackage {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly entryCount: number;
  readonly validation: PackageValidationData;
}

const SCHEMAS: SchemaRegistry = {
  "artifact-envelope.schema.json": artifactEnvelopeSchema,
  "bridge-context.schema.json": bridgeContextSchema,
  "capture-session.schema.json": captureSessionSchema,
  "diagnostic.schema.json": diagnosticSchema,
  "diagnostics-artifact.schema.json": diagnosticsArtifactSchema,
  "evidence-coverage.schema.json": evidenceCoverageSchema,
  "observation-set.schema.json": observationSetSchema,
  "package-manifest.schema.json": packageManifestSchema,
  "package-validation.schema.json": packageValidationSchema,
  "page-structure-summary.schema.json": pageStructureSummarySchema,
  "python-feed-readiness.schema.json": pythonFeedReadinessSchema,
  "runtime-context.schema.json": runtimeContextSchema,
  "runtime-coverage.schema.json": runtimeCoverageSchema,
  "runtime-snapshot.schema.json": runtimeSnapshotSchema,
  "source-binding-coverage.schema.json": sourceBindingCoverageSchema,
  "source-binding-evidence.schema.json": sourceBindingEvidenceSchema,
  "source-context-reference.schema.json": sourceContextReferenceSchema,
  "source-runtime-cardinality.schema.json": sourceRuntimeCardinalitySchema,
  "schema-index.schema.json": schemaIndexSchema,
};

export async function buildEvidencePackage(
  input: EvidencePackageInput,
): Promise<BuiltEvidencePackage> {
  await validateInput(input);
  const purpose = input.purpose ?? "RUNTIME_EVIDENCE";
  const pythonFeedReadiness = await evaluatePythonFeedReadiness({
    session: input.session,
    snapshots: input.snapshots,
    sourceContext: input.sourceContext ?? null,
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const sessionId = input.session.data.session_id;
  const runtimeBundleId = await deterministicUuid("edis.runtime.bundle", sessionId);
  const entries = new Map<string, Uint8Array>();
  const artifactSchemaByPath = new Map<string, string>();
  const snapshots = [...input.snapshots].sort(
    (left, right) =>
      left.observation_index - right.observation_index ||
      compareCanonicalStrings(left.captured_at, right.captured_at) ||
      compareCanonicalStrings(left.snapshot_id, right.snapshot_id),
  );
  const screenshotBySnapshotId = new Map(
    input.screenshots.map((screenshot) => [screenshot.snapshotId, screenshot] as const),
  );
  const capturedAt = snapshots[0]?.captured_at ?? input.session.captured_at;
  const aggregateDiagnostics = aggregateDiagnosticsFromSnapshots(snapshots);
  const extensionProvenance = await collectExtensionRuntimeProvenance(input.session);
  const provenanceDiagnostics = [extensionProvenanceDiagnostic(extensionProvenance)];
  const packageDiagnostics = mergeDiagnostics(
    aggregateDiagnostics,
    buildCoverageDiagnostics(snapshots, input.screenshots),
    provenanceDiagnostics,
  );
  const partialReasons = uniqueSorted(
    snapshots.flatMap((snapshot) => snapshot.capture_completeness.reasons),
  );
  const identityCollisionCount = snapshots.reduce(
    (total, snapshot) => total + snapshot.capture_completeness.identity_collision_count,
    0,
  );
  const captureCompleteness = snapshots.every(
    (snapshot) => snapshot.capture_completeness.status === "COMPLETE",
  )
    ? "COMPLETE"
    : "PARTIAL";

  const observationRecords: Array<{
    observation_index: number;
    snapshot_id: string;
    user_label: string;
    requested_profile_id: string;
    captured_at: string;
    measured_viewport_width: number;
    measured_viewport_height: number;
    page_fingerprint: string;
    runtime_structure_sha256: string;
    snapshot_path: string;
    screenshot_path: string | null;
  }> = [];

  for (const [index, snapshot] of snapshots.entries()) {
    const folder = `observations/observation-${String(index + 1).padStart(4, "0")}`;
    const snapshotPath = `${folder}/snapshot.json`;
    const snapshotEnvelope = snapshotToEnvelope(snapshot);
    assertSchema(snapshotEnvelope, "runtime-snapshot.schema.json");
    entries.set(snapshotPath, encoder.encode(canonicalJson(snapshotEnvelope)));
    artifactSchemaByPath.set(snapshotPath, "runtime-snapshot.schema.json");

    const screenshot = screenshotBySnapshotId.get(snapshot.snapshot_id);
    let screenshotPath: string | null = null;
    if (screenshot) {
      const bytes = new Uint8Array(screenshot.bytes);
      if ((await sha256Hex(bytes)) !== screenshot.checksumSha256)
        throw new Error("Stored screenshot checksum validation failed.");
      screenshotPath = `${folder}/screenshot.png`;
      entries.set(screenshotPath, bytes);
    }

    observationRecords.push({
      observation_index: snapshot.observation_index,
      snapshot_id: snapshot.snapshot_id,
      user_label: snapshot.viewport.user_label,
      requested_profile_id: snapshot.viewport.requested_profile_id,
      captured_at: snapshot.captured_at,
      measured_viewport_width: snapshot.viewport.inner_width,
      measured_viewport_height: snapshot.viewport.inner_height,
      page_fingerprint: snapshot.page.page_fingerprint,
      runtime_structure_sha256: snapshot.runtime_structure_sha256,
      snapshot_path: snapshotPath,
      screenshot_path: screenshotPath,
    });
  }

  const observationSet = makeEnvelope(
    "urn:edis:schema:browser:observation-set",
    "1.1.0",
    "observation_set",
    capturedAt,
    {
      runtime_bundle_id: runtimeBundleId,
      observation_set_id: input.session.data.observation_set_id,
      analysis_set_id: input.session.data.source_context_reference?.analysis_set_id ?? null,
      session_id: sessionId,
      source_context_reference: input.session.data.source_context_reference,
      observations: observationRecords,
    },
  );
  assertSchema(observationSet, "observation-set.schema.json");
  entries.set("observation-set.json", encoder.encode(canonicalJson(observationSet)));
  artifactSchemaByPath.set("observation-set.json", "observation-set.schema.json");

  const runtimeContext = makeEnvelope(
    "urn:edis:schema:browser:runtime-context",
    "1.0.0",
    "runtime_context",
    capturedAt,
    {
      runtime_bundle_id: runtimeBundleId,
      session_id: sessionId,
      runtime_environment: input.session.data.runtime_environment,
      capture_configuration: deriveCaptureConfiguration(snapshots),
      source_context_reference: input.session.data.source_context_reference,
    },
    provenanceDiagnostics,
  );
  assertSchema(runtimeContext, "runtime-context.schema.json");
  entries.set("context/runtime-context.json", encoder.encode(canonicalJson(runtimeContext)));
  artifactSchemaByPath.set("context/runtime-context.json", "runtime-context.schema.json");

  if (input.session.data.source_context_reference) {
    const sourceReference = makeEnvelope(
      "urn:edis:schema:browser:source-context-reference",
      "1.0.0",
      "source_context_reference",
      capturedAt,
      input.session.data.source_context_reference,
    );
    assertSchema(sourceReference, "source-context-reference.schema.json");
    entries.set(
      "context/source-context-reference.json",
      encoder.encode(canonicalJson(sourceReference)),
    );
    artifactSchemaByPath.set(
      "context/source-context-reference.json",
      "source-context-reference.schema.json",
    );
  }

  if (input.sourceContext) {
    assertSchema(input.sourceContext, "bridge-context.schema.json");
    entries.set(
      "source-context/wordpress-source-context.json",
      encoder.encode(canonicalJson(input.sourceContext)),
    );
    artifactSchemaByPath.set(
      "source-context/wordpress-source-context.json",
      "bridge-context.schema.json",
    );
  }

  const pythonFeedArtifact = makeEnvelope(
    "urn:edis:schema:browser:python-feed-readiness",
    "1.1.0",
    "python_feed_readiness",
    capturedAt,
    pythonFeedReadiness,
  );
  assertSchema(pythonFeedArtifact, "python-feed-readiness.schema.json");
  entries.set(
    "validation/python-feed-readiness.json",
    encoder.encode(canonicalJson(pythonFeedArtifact)),
  );
  artifactSchemaByPath.set(
    "validation/python-feed-readiness.json",
    "python-feed-readiness.schema.json",
  );

  const runtimeCoverage = makeEnvelope(
    "urn:edis:schema:browser:runtime-coverage",
    "1.0.0",
    "runtime_coverage",
    capturedAt,
    buildRuntimeCoverage(snapshots, input.screenshots, aggregateDiagnostics),
    packageDiagnostics,
  );
  assertSchema(runtimeCoverage, "runtime-coverage.schema.json");
  entries.set("coverage/runtime-coverage.json", encoder.encode(canonicalJson(runtimeCoverage)));
  artifactSchemaByPath.set("coverage/runtime-coverage.json", "runtime-coverage.schema.json");

  const bindingCoverage = makeEnvelope(
    "urn:edis:schema:browser:source-binding-coverage",
    "1.0.0",
    "source_binding_coverage",
    capturedAt,
    buildSourceBindingCoverage(snapshots),
  );
  assertSchema(bindingCoverage, "source-binding-coverage.schema.json");
  entries.set(
    "coverage/source-binding-coverage.json",
    encoder.encode(canonicalJson(bindingCoverage)),
  );
  artifactSchemaByPath.set(
    "coverage/source-binding-coverage.json",
    "source-binding-coverage.schema.json",
  );

  const cardinalityArtifact = makeEnvelope(
    "urn:edis:schema:browser:source-runtime-cardinality",
    "1.0.0",
    "source_runtime_cardinality",
    capturedAt,
    {
      observations: snapshots.map((snapshot) => ({
        observation_index: snapshot.observation_index,
        snapshot_id: snapshot.snapshot_id,
        page_context_id: snapshot.page.page_context_id,
        cardinality: snapshot.source_runtime_cardinality,
      })),
    },
  );
  assertSchema(cardinalityArtifact, "source-runtime-cardinality.schema.json");
  entries.set(
    "coverage/source-runtime-cardinality.json",
    encoder.encode(canonicalJson(cardinalityArtifact)),
  );
  artifactSchemaByPath.set(
    "coverage/source-runtime-cardinality.json",
    "source-runtime-cardinality.schema.json",
  );

  const evidenceCoverage = makeEnvelope(
    "urn:edis:schema:browser:evidence-coverage",
    "1.0.0",
    "evidence_coverage",
    capturedAt,
    buildEvidenceCoverage(snapshots, input.screenshots),
    packageDiagnostics,
  );
  assertSchema(evidenceCoverage, "evidence-coverage.schema.json");
  entries.set("coverage/evidence-coverage.json", encoder.encode(canonicalJson(evidenceCoverage)));
  artifactSchemaByPath.set("coverage/evidence-coverage.json", "evidence-coverage.schema.json");

  const pageStructureArtifact = makeEnvelope(
    "urn:edis:schema:browser:page-structure-summary",
    "1.0.0",
    "page_structure_summary",
    capturedAt,
    {
      observations: snapshots.map((snapshot) => ({
        observation_index: snapshot.observation_index,
        snapshot_id: snapshot.snapshot_id,
        page_context_id: snapshot.page.page_context_id,
        page_fingerprint: snapshot.page.page_fingerprint,
        source_documents_present: snapshot.page.source_documents_present,
        summary: snapshot.page_structure_summary,
        runtime_regions: snapshot.runtime_regions,
        document_instances: snapshot.document_instances,
      })),
    },
  );
  assertSchema(pageStructureArtifact, "page-structure-summary.schema.json");
  entries.set(
    "structure/page-structure-summary.json",
    encoder.encode(canonicalJson(pageStructureArtifact)),
  );
  artifactSchemaByPath.set(
    "structure/page-structure-summary.json",
    "page-structure-summary.schema.json",
  );

  const diagnosticsArtifact = makeEnvelope(
    "urn:edis:schema:browser:diagnostics-artifact",
    "1.0.0",
    "diagnostics",
    capturedAt,
    { diagnostics: packageDiagnostics },
    [],
  );
  assertSchema(diagnosticsArtifact, "diagnostics-artifact.schema.json");
  entries.set("diagnostics/diagnostics.json", encoder.encode(canonicalJson(diagnosticsArtifact)));
  artifactSchemaByPath.set("diagnostics/diagnostics.json", "diagnostics-artifact.schema.json");

  assertSchema(schemaIndex, "schema-index.schema.json");
  for (const [name, schema] of Object.entries({ ...SCHEMAS, "schema-index.json": schemaIndex })) {
    entries.set(`schemas/${name}`, encoder.encode(canonicalJson(schema)));
  }

  entries.set(
    "README.txt",
    encoder.encode(
      `EDIS Browser Runtime Evidence Package ${COLLECTOR_VERSION}\n\n${
        purpose === "MINIMUM_PYTHON_FEED"
          ? "This minimum Python feed contains the imported WordPress Source Context plus three or more validated runtime observations. "
          : ""
      }This local package contains bounded rendered-page facts and preliminary source-binding evidence only. It contains no UX scores, recommendations, cookies, browser history, form values, or remote data. Browser binding is not Python final correlation. Validate package-manifest.json, schema-index.json, artifact schema identifiers, and checksums.sha256 before ingestion.\n`,
    ),
  );

  const validation: PackageValidationData = {
    validation_state: "PASS",
    schema_validation: "PASS",
    canonical_json_validation: "PASS",
    checksum_validation: "PASS",
    referential_integrity: "PASS",
    identity_uniqueness_validation: "PASS",
    relationship_integrity: "PASS",
    source_binding_integrity: "PASS",
    package_manifest_validation: "PASS",
    identity_collision_count: identityCollisionCount,
    capture_completeness: captureCompleteness,
    partial_reasons: partialReasons,
    validated_json_files: artifactSchemaByPath.size + 2,
    canonical_json_files: artifactSchemaByPath.size + 2 + Object.keys(SCHEMAS).length + 1,
    artifact_json_files: artifactSchemaByPath.size + 2,
    embedded_schema_files: Object.keys(SCHEMAS).length + 1,
    schema_validated_artifact_paths: [
      ...artifactSchemaByPath.keys(),
      "validation/package-validation.json",
      "package-manifest.json",
    ].sort(compareCanonicalStrings),
    schema_unvalidated_artifact_paths: [],
    export_allowed: true,
  };
  const validationArtifact = makeEnvelope(
    "urn:edis:schema:browser:package-validation",
    "1.0.0",
    "package_validation",
    capturedAt,
    validation,
  );
  assertSchema(validationArtifact, "package-validation.schema.json");
  entries.set(
    "validation/package-validation.json",
    encoder.encode(canonicalJson(validationArtifact)),
  );
  artifactSchemaByPath.set("validation/package-validation.json", "package-validation.schema.json");

  const fileRecords = await hashEntries(entries);
  const packageManifest = makeEnvelope(
    "urn:edis:schema:browser:package-manifest",
    RUNTIME_PACKAGE_SCHEMA_VERSION,
    "runtime_package_manifest",
    capturedAt,
    {
      runtime_bundle_id: runtimeBundleId,
      observation_set_id: input.session.data.observation_set_id,
      session_id: sessionId,
      package_validation_state: "PASS",
      capture_completeness: captureCompleteness,
      partial_reasons: partialReasons,
      files: fileRecords,
      canonicalization_profile: "EDIS-CJ-1",
      hash_algorithm: "sha256",
      snapshot_count: snapshots.length,
      screenshot_count: observationRecords.filter((record) => record.screenshot_path !== null)
        .length,
    },
    packageDiagnostics,
  );
  assertSchema(packageManifest, "package-manifest.schema.json");
  const manifestBytes = encoder.encode(canonicalJson(packageManifest));
  entries.set("package-manifest.json", manifestBytes);
  artifactSchemaByPath.set("package-manifest.json", "package-manifest.schema.json");

  const inventoryRecords = [
    {
      path: "package-manifest.json",
      sha256: await sha256Digest(manifestBytes),
    },
    ...fileRecords.map((record) => ({ path: record.path, sha256: record.sha256 })),
  ].sort((left, right) => compareCanonicalStrings(left.path, right.path));
  const checksumText =
    inventoryRecords.map((record) => `${record.sha256}  ${record.path}`).join("\n") + "\n";
  entries.set("checksums.sha256", encoder.encode(checksumText));

  await validateFinalEntries(entries, packageManifest, decoder, artifactSchemaByPath);
  const zipEntries: ZipEntry[] = [...entries.entries()].map(([path, data]) => ({ path, data }));
  const entryCount = zipEntries.length;
  const bytes = createStoreZip(zipEntries);
  entries.clear();
  zipEntries.length = 0;
  const externalValidation = await validateEvidencePackageArchive(bytes);
  if (externalValidation.validation_state !== "PASS") {
    throw new Error(
      `External package validation failed: ${externalValidation.issues[0] ?? "unknown error"}`,
    );
  }
  return {
    bytes,
    filename:
      purpose === "MINIMUM_PYTHON_FEED"
        ? `edis-python-feed-${runtimeBundleId}.zip`
        : `edis-runtime-package-${runtimeBundleId}.zip`,
    entryCount,
    validation,
  };
}

function snapshotToEnvelope(snapshot: RuntimeSnapshot): ArtifactEnvelope<Record<string, unknown>> {
  return makeEnvelope(
    "urn:edis:schema:browser:runtime-snapshot",
    SCHEMA_VERSION,
    "runtime_snapshot",
    snapshot.captured_at,
    {
      snapshot_id: snapshot.snapshot_id,
      session_id: snapshot.session_id,
      observation_index: snapshot.observation_index,
      capture_intent: snapshot.capture_intent,
      capture_configuration: snapshot.capture_configuration,
      evidence_source: snapshot.evidence_source,
      runtime_environment: snapshot.runtime_environment,
      source_context_reference: snapshot.source_context_reference,
      page: snapshot.page,
      viewport: snapshot.viewport,
      document_metrics: snapshot.document_metrics,
      capture_readiness: snapshot.capture_readiness,
      capture_state: snapshot.capture_state,
      capture_environment: snapshot.capture_environment,
      capture_completeness: snapshot.capture_completeness,
      runtime_structure_sha256: snapshot.runtime_structure_sha256,
      runtime_regions: snapshot.runtime_regions,
      page_structure_summary: snapshot.page_structure_summary,
      document_instances: snapshot.document_instances,
      source_runtime_cardinality: snapshot.source_runtime_cardinality,
      elements: snapshot.elements,
      privacy: snapshot.privacy,
    },
    snapshot.diagnostics,
  );
}

function deriveCaptureConfiguration(
  snapshots: readonly RuntimeSnapshot[],
): Record<string, unknown> {
  return {
    observations: snapshots.map((snapshot) => ({
      observation_index: snapshot.observation_index,
      snapshot_id: snapshot.snapshot_id,
      capture_intent: snapshot.capture_intent,
      ...snapshot.capture_configuration,
    })),
  };
}

function buildRuntimeCoverage(
  snapshots: readonly RuntimeSnapshot[],
  screenshots: readonly ScreenshotRecord[],
  aggregateDiagnostics: readonly Diagnostic[],
): Record<string, unknown> {
  const allElements = snapshots.flatMap((snapshot) => snapshot.elements);
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshot_id));
  const screenshotRequested = snapshots.filter(
    (snapshot) => snapshot.privacy.screenshot_requested,
  ).length;
  const screenshotAvailable = screenshots.filter((screenshot) =>
    snapshotIds.has(screenshot.snapshotId),
  ).length;

  const moduleAvailability = (
    enabled: (snapshot: RuntimeSnapshot) => boolean,
    evidence: (snapshot: RuntimeSnapshot) => readonly RuntimeAvailability[],
  ): RuntimeAvailability => {
    const enabledSnapshots = snapshots.filter(enabled);
    if (enabledSnapshots.length === 0) return "DISABLED";
    const states = enabledSnapshots.flatMap(evidence);
    if (states.length === 0) return "INSUFFICIENT";
    if (states.some((state) => state === "ERROR")) return "ERROR";
    if (states.some((state) => state === "UNAVAILABLE")) return "UNAVAILABLE";
    if (states.some((state) => state === "PARTIAL" || state === "INSUFFICIENT")) return "PARTIAL";
    return "AVAILABLE";
  };

  const readinessCounts = countBy(
    snapshots.map((snapshot) => snapshot.capture_readiness.process_state),
    ["STABLE", "UNSTABLE", "TIMEOUT", "INSUFFICIENT", "ERROR"],
  );
  const completeObservations = snapshots.filter(
    (snapshot) => snapshot.capture_completeness.status === "COMPLETE",
  ).length;
  const distinctViewportDimensions = new Set(
    snapshots.map(
      (snapshot) => `${snapshot.viewport.inner_width}x${snapshot.viewport.inner_height}`,
    ),
  ).size;
  const semanticErrors = aggregateDiagnostics.filter(
    (item) => item.scope === "SEMANTIC" && item.severity === "ERROR",
  ).length;

  return {
    runtime_availability:
      semanticErrors > 0
        ? "ERROR"
        : snapshots.every(
              (snapshot) =>
                snapshot.status === "AVAILABLE" &&
                snapshot.capture_completeness.status === "COMPLETE",
            )
          ? "AVAILABLE"
          : "PARTIAL",
    observations: snapshots.length,
    elements_discovered: snapshots.reduce(
      (total, snapshot) => total + snapshot.capture_completeness.elements_visited,
      0,
    ),
    elements_emitted: allElements.length,
    truncated_branch_count: snapshots.reduce(
      (total, snapshot) => total + snapshot.capture_completeness.truncated_branch_count,
      0,
    ),
    maximum_depth_observed: Math.max(
      ...snapshots.map((snapshot) => snapshot.capture_completeness.maximum_depth_observed),
      0,
    ),
    traversal: {
      element_budget_total: snapshots.reduce(
        (total, snapshot) => total + snapshot.capture_completeness.element_budget,
        0,
      ),
      element_budget_used: snapshots.reduce(
        (total, snapshot) => total + snapshot.capture_completeness.element_budget_used,
        0,
      ),
      scan_budget_total: snapshots.reduce(
        (total, snapshot) => total + snapshot.capture_completeness.scan_budget,
        0,
      ),
      scan_budget_used: snapshots.reduce(
        (total, snapshot) => total + snapshot.capture_completeness.scan_budget_used,
        0,
      ),
    },
    capture_completeness: {
      complete_observations: completeObservations,
      partial_observations: snapshots.length - completeObservations,
    },
    modules: {
      geometry: allElements.length > 0 ? "AVAILABLE" : "INSUFFICIENT",
      computed_styles: allElements.length > 0 ? "AVAILABLE" : "INSUFFICIENT",
      relationships: moduleAvailability(
        (snapshot) => snapshot.capture_configuration.include_relationship_graph,
        (snapshot) => snapshot.elements.map((element) => element.relationships.availability),
      ),
      interaction_facts: moduleAvailability(
        (snapshot) => snapshot.capture_configuration.include_interaction_facts,
        (snapshot) => snapshot.elements.map((element) => element.interaction_facts.availability),
      ),
      text_shape: moduleAvailability(
        (snapshot) => snapshot.capture_configuration.include_text_shape,
        (snapshot) => snapshot.elements.map((element) => element.text_shape.availability),
      ),
      capture_readiness: moduleAvailability(
        () => true,
        (snapshot) => [snapshot.capture_readiness.availability],
      ),
    },
    readiness: readinessCounts,
    multi_viewport: {
      observation_count: snapshots.length,
      distinct_measured_dimensions: distinctViewportDimensions,
      availability: distinctViewportDimensions > 1 ? "AVAILABLE" : "INSUFFICIENT",
    },
    screenshots: {
      requested: screenshotRequested,
      available: screenshotAvailable,
      failed: Math.max(0, screenshotRequested - screenshotAvailable),
    },
    error_diagnostics: semanticErrors,
  };
}

function buildSourceBindingCoverage(
  snapshots: readonly RuntimeSnapshot[],
): Record<string, unknown> {
  const elements = snapshots.flatMap((snapshot) => snapshot.elements);
  const elementCounts = countBy(
    elements.map((element) => element.source_binding.binding_state),
    ["EXACT", "PROBABLE", "AMBIGUOUS", "UNMATCHED"],
  );
  const pageCounts = countBy(
    snapshots.map((snapshot) => snapshot.page.page_binding_evidence.binding_state),
    ["EXACT", "PROBABLE", "AMBIGUOUS", "UNMATCHED"],
  );
  const context =
    snapshots.find((snapshot) => snapshot.source_context_reference)?.source_context_reference ??
    null;
  const imported = context !== null;
  const selected = context?.selected_document_id ?? null;
  const boundElements = elementCounts.EXACT + elementCounts.PROBABLE;
  return {
    availability: !imported
      ? "INSUFFICIENT"
      : !selected
        ? "INSUFFICIENT"
        : elementCounts.AMBIGUOUS > 0
          ? "PARTIAL"
          : "AVAILABLE",
    source_context_imported: imported,
    selected_document_id: selected,
    pages: {
      total: snapshots.length,
      exact: pageCounts.EXACT,
      probable: pageCounts.PROBABLE,
      ambiguous: pageCounts.AMBIGUOUS,
      unmatched: pageCounts.UNMATCHED,
    },
    elements_total: elements.length,
    elements_with_binding_evidence: boundElements + elementCounts.AMBIGUOUS,
    exact: elementCounts.EXACT,
    probable: elementCounts.PROBABLE,
    ambiguous: elementCounts.AMBIGUOUS,
    unmatched: elementCounts.UNMATCHED,
  };
}

function buildEvidenceCoverage(
  snapshots: readonly RuntimeSnapshot[],
  screenshots: readonly ScreenshotRecord[],
): Record<string, unknown> {
  const elements = snapshots.flatMap((snapshot) => snapshot.elements);
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.snapshot_id));
  const binding = countBy(
    elements.map((element) => element.source_binding.binding_state),
    ["EXACT", "PROBABLE", "AMBIGUOUS", "UNMATCHED"],
  );
  const sourceContextImported = snapshots.some(
    (snapshot) => snapshot.source_context_reference !== null,
  );
  const distinctViewports = new Set(
    snapshots.map(
      (snapshot) => `${snapshot.viewport.inner_width}x${snapshot.viewport.inner_height}`,
    ),
  ).size;
  const availableScreenshots = screenshots.filter((screenshot) =>
    snapshotIds.has(screenshot.snapshotId),
  ).length;
  const bound = binding.EXACT + binding.PROBABLE;
  const sourceBindingStatus: RuntimeAvailability = !sourceContextImported
    ? "INSUFFICIENT"
    : binding.AMBIGUOUS > 0 || (bound > 0 && binding.UNMATCHED > 0)
      ? "PARTIAL"
      : bound > 0
        ? "AVAILABLE"
        : "INSUFFICIENT";
  const visualStatus: RuntimeAvailability =
    availableScreenshots === 0
      ? "INSUFFICIENT"
      : availableScreenshots === snapshots.length
        ? "AVAILABLE"
        : "PARTIAL";
  return {
    runtime_observations: snapshots.length,
    runtime_nodes: elements.length,
    source_context_imported: sourceContextImported,
    source_binding: {
      exact: binding.EXACT,
      probable: binding.PROBABLE,
      ambiguous: binding.AMBIGUOUS,
      unmatched: binding.UNMATCHED,
    },
    screenshots: availableScreenshots,
    distinct_viewports: distinctViewports,
    hidden_elements_included: snapshots.some(
      (snapshot) => snapshot.capture_configuration.include_hidden_elements,
    ),
    colors_included: snapshots.some((snapshot) => snapshot.capture_configuration.include_colors),
    text_preview_included: snapshots.some(
      (snapshot) => snapshot.capture_configuration.include_text_preview,
    ),
    statuses: {
      runtime_evidence: snapshots.length > 0 ? "AVAILABLE" : "INSUFFICIENT",
      source_context: sourceContextImported ? "AVAILABLE" : "INSUFFICIENT",
      source_runtime_binding: sourceBindingStatus,
      responsive_comparison: distinctViewports > 1 ? "AVAILABLE" : "INSUFFICIENT",
      visual_verification: visualStatus,
    },
  };
}

function buildCoverageDiagnostics(
  snapshots: readonly RuntimeSnapshot[],
  screenshots: readonly ScreenshotRecord[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!snapshots.some((snapshot) => snapshot.source_context_reference !== null)) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SOURCE_CONTEXT_NOT_IMPORTED",
        "INFO",
        "Source Context was not imported; source/runtime binding remains insufficient.",
        true,
        { runtime_node_count: snapshots.reduce((total, item) => total + item.elements.length, 0) },
      ),
    );
  }
  const distinctViewports = new Set(
    snapshots.map(
      (snapshot) => `${snapshot.viewport.inner_width}x${snapshot.viewport.inner_height}`,
    ),
  ).size;
  if (distinctViewports < 2) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SINGLE_VIEWPORT_ONLY",
        "INFO",
        "Only one measured viewport is available for this package.",
        true,
        { observation_count: snapshots.length, distinct_viewport_count: distinctViewports },
      ),
    );
  }
  if (screenshots.length === 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SCREENSHOT_NOT_REQUESTED",
        "INFO",
        "No screenshot evidence is available in this package.",
        true,
      ),
    );
  }
  if (snapshots.every((snapshot) => !snapshot.capture_configuration.include_hidden_elements)) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_HIDDEN_ELEMENTS_EXCLUDED",
        "INFO",
        "Hidden elements were excluded from every observation.",
        true,
      ),
    );
  }
  const incompleteOutsideViewport = snapshots.reduce(
    (total, snapshot) =>
      total +
      Math.max(
        0,
        snapshot.capture_readiness.incomplete_image_count_total -
          snapshot.capture_readiness.incomplete_image_count_in_viewport,
      ),
    0,
  );
  if (incompleteOutsideViewport > 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_INCOMPLETE_IMAGES_OUTSIDE_VIEWPORT",
        "INFO",
        "Incomplete images were observed outside the visible viewport.",
        true,
        { incomplete_image_count_outside_viewport: incompleteOutsideViewport },
      ),
    );
  }
  const unfocused = snapshots.filter(
    (snapshot) => snapshot.capture_environment.document_not_focused,
  ).length;
  if (unfocused > 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_DOCUMENT_NOT_FOCUSED",
        "WARNING",
        "The document was not focused for one or more observations.",
        true,
        { unfocused_observation_count: unfocused },
        "OPERATIONAL",
      ),
    );
  }
  const noncanonicalScroll = snapshots.filter(
    (snapshot) =>
      Math.abs(snapshot.capture_state.scroll_x) > 1 ||
      Math.abs(snapshot.capture_state.scroll_y) > 1,
  ).length;
  if (noncanonicalScroll > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_PAGE_NOT_AT_CANONICAL_SCROLL",
        "WARNING",
        "One or more observations were captured away from scroll position zero.",
        true,
        { observation_count: noncanonicalScroll },
        "OPERATIONAL",
      ),
    );
  const hidden = snapshots.filter(
    (snapshot) => snapshot.capture_state.document_visibility_state !== "visible",
  ).length;
  if (hidden > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_PAGE_NOT_VISIBLE",
        "WARNING",
        "One or more observations were captured while the page was not visible.",
        true,
        { observation_count: hidden },
        "OPERATIONAL",
      ),
    );
  const prerendering = snapshots.filter(
    (snapshot) => snapshot.capture_state.document_prerendering,
  ).length;
  if (prerendering > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_PAGE_PRERENDERING",
        "WARNING",
        "One or more observations were captured while prerendering.",
        true,
        { observation_count: prerendering },
        "OPERATIONAL",
      ),
    );
  const adminBar = snapshots.filter(
    (snapshot) => snapshot.capture_environment.admin_bar.detection_state !== "ABSENT",
  ).length;
  if (adminBar > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_WORDPRESS_ADMIN_BAR_PRESENT_OR_AMBIGUOUS",
        "WARNING",
        "WordPress Admin Bar evidence was present or ambiguous.",
        true,
        { observation_count: adminBar },
        "OPERATIONAL",
      ),
    );
  const unresolvedImages = snapshots.filter((snapshot) => {
    const image = snapshot.capture_readiness.viewport_image_readiness;
    return (
      image.broken_count + image.pending_count + image.decode_failed_count + image.timed_out_count >
      0
    );
  }).length;
  if (unresolvedImages > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_VIEWPORT_IMAGES_NOT_READY",
        "WARNING",
        "One or more observations contain unresolved viewport images.",
        true,
        { observation_count: unresolvedImages },
        "OPERATIONAL",
      ),
    );
  return diagnostics;
}

function mergeDiagnostics(...groups: readonly (readonly Diagnostic[])[]): readonly Diagnostic[] {
  return canonicalDiagnosticSet(groups.flat());
}

function countBy<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  const result = Object.create(null) as Record<T, number>;
  for (const key of keys) result[key] = 0;
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

async function hashEntries(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<readonly { path: string; bytes: number; sha256: string }[]> {
  const records: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const [path, data] of [...entries.entries()].sort(([left], [right]) =>
    compareCanonicalStrings(left, right),
  )) {
    records.push({ path, bytes: data.length, sha256: await sha256Digest(data) });
  }
  return records;
}

function assertSchema(value: unknown, schemaName: string): void {
  const issues = validateJsonSchema(value, schemaName, SCHEMAS);
  if (issues.length > 0) {
    const first = issues[0];
    throw new Error(
      `Embedded schema validation failed for ${schemaName} at ${first?.path ?? "$"}: ${first?.message ?? "unknown error"}`,
    );
  }
}

async function validateFinalEntries(
  entries: ReadonlyMap<string, Uint8Array>,
  packageManifest: ArtifactEnvelope<{
    readonly files: readonly { path: string; bytes: number; sha256: string }[];
  }>,
  decoder: TextDecoder,
  artifactSchemaByPath: ReadonlyMap<string, string>,
): Promise<void> {
  const expectedRecords = packageManifest.data.files;
  const inventory = exactPackageInventory(expectedRecords.map((record) => record.path));
  assertExactPathSet([...entries.keys()], inventory.zipPaths, "Final package");
  const validatedDigests = new Map<string, string>();
  for (const record of expectedRecords) {
    const bytes = entries.get(record.path);
    const digest = bytes ? await sha256Digest(bytes) : null;
    if (!bytes || bytes.length !== record.bytes || digest !== record.sha256)
      throw new Error(`Final package file validation failed: ${record.path}`);
    validatedDigests.set(record.path, digest);
  }

  for (const [path, bytes] of entries) {
    if (!path.endsWith(".json")) continue;
    const text = decoder.decode(bytes);
    const parsed = parseSafeJson(text);
    if (canonicalJson(parsed) !== text)
      throw new Error(`Final package JSON is not canonical: ${path}`);
    const schemaName = artifactSchemaByPath.get(path);
    if (schemaName) {
      const issues = validateJsonSchema(parsed, schemaName, SCHEMAS);
      if (issues.length > 0)
        throw new Error(
          `Final artifact schema validation failed for ${path} at ${issues[0]?.path ?? "$"}.`,
        );
    } else if (!path.startsWith("schemas/")) {
      throw new Error(`Final JSON artifact has no declared validation schema: ${path}`);
    }
  }

  const checksumText = decoder.decode(entries.get("checksums.sha256") ?? new Uint8Array());
  const checksumLines = checksumText
    .trimEnd()
    .split("\n")
    .map((line) => {
      const match = /^(sha256:[0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) throw new Error("Final checksum inventory is malformed.");
      return { digest: match[1] ?? "", path: match[2] ?? "" };
    });
  assertExactPathSet(
    checksumLines.map((line) => line.path),
    inventory.checksumPaths,
    "Final checksum",
  );
  for (const line of checksumLines) {
    const bytes = entries.get(line.path);
    const digest = validatedDigests.get(line.path) ?? (bytes ? await sha256Digest(bytes) : null);
    if (!bytes || digest !== line.digest)
      throw new Error(`Final checksum validation failed: ${line.path || "unknown"}`);
    validatedDigests.set(line.path, digest);
  }
}

async function validateInput(input: EvidencePackageInput): Promise<void> {
  if (input.snapshots.length === 0)
    throw new Error("A complete package requires at least one snapshot.");
  if (input.session.data.status === "FAILED" || input.session.data.status === "CAPTURING")
    throw new Error("Session is not exportable.");
  const requestedPurpose = input.purpose ?? "RUNTIME_EVIDENCE";
  if (!isExportPurposeAllowed(input.session.data.workflow_mode, requestedPurpose))
    throw new Error(
      "EDIS_RUNTIME_SESSION_WORKFLOW_MODE_MISMATCH: session mode does not permit this export purpose.",
    );
  const observationIndexes = [...input.snapshots]
    .map((snapshot) => snapshot.observation_index)
    .sort((left, right) => left - right);
  if (new Set(observationIndexes).size !== observationIndexes.length)
    throw new Error(
      "EDIS_RUNTIME_DUPLICATE_OBSERVATION_INDEX: observation indexes must be unique.",
    );
  if (observationIndexes.some((value, index) => value !== index))
    throw new Error(
      "EDIS_RUNTIME_NON_CONTIGUOUS_OBSERVATION_INDEX: observation indexes must be contiguous from zero.",
    );
  const snapshotIds = new Set<string>();
  for (const snapshot of input.snapshots) {
    if (!isRuntimeSnapshot(snapshot)) throw new Error("Stored snapshot failed runtime validation.");
    if (hasReadinessError(snapshot.capture_readiness))
      throw new Error("EDIS_RUNTIME_READINESS_ERROR");
    if (snapshot.session_id !== input.session.data.session_id)
      throw new Error("Snapshot belongs to a different session.");
    if (snapshotIds.has(snapshot.snapshot_id)) throw new Error("Duplicate snapshot identifier.");
    snapshotIds.add(snapshot.snapshot_id);
    assertElementorMetricInvariant(snapshot.document_metrics);
    validateSnapshotRelationships(snapshot);
    validateSnapshotBindings(snapshot);
  }
  const summaryIds = input.session.data.captures.map((capture) => capture.snapshot_id);
  const summaryIdSet = new Set(summaryIds);
  if (summaryIdSet.size !== summaryIds.length)
    throw new Error("Session contains duplicate capture summaries.");
  if (input.snapshots.some((snapshot) => !summaryIdSet.has(snapshot.snapshot_id)))
    throw new Error(
      "EDIS_RUNTIME_ORPHAN_SNAPSHOT: a snapshot is missing from the session capture summary.",
    );
  if (summaryIds.some((snapshotId) => !snapshotIds.has(snapshotId)))
    throw new Error(
      "EDIS_RUNTIME_MISSING_SNAPSHOT: a session capture summary references a missing snapshot.",
    );
  const screenshotIds = input.screenshots.map((item) => item.snapshotId);
  if (new Set(screenshotIds).size !== screenshotIds.length)
    throw new Error("Duplicate screenshots prevent export.");
  for (const screenshot of input.screenshots) {
    if (!isScreenshotRecord(screenshot))
      throw new Error("Stored screenshot failed runtime validation.");
    if (
      screenshot.sessionId !== input.session.data.session_id ||
      !snapshotIds.has(screenshot.snapshotId)
    ) {
      throw new Error("Screenshot belongs to a different session or snapshot.");
    }
  }
  if ((input.purpose ?? "RUNTIME_EVIDENCE") === "MINIMUM_PYTHON_FEED") {
    const readiness = await evaluatePythonFeedReadiness({
      session: input.session,
      snapshots: input.snapshots,
      sourceContext: input.sourceContext ?? null,
    });
    if (!readiness.export_allowed)
      throw new Error(`EDIS_RUNTIME_PYTHON_FEED_NOT_READY: ${readiness.blocking_codes.join(", ")}`);
  }
}

function validateSnapshotRelationships(snapshot: RuntimeSnapshot): void {
  const nodes = new Set(snapshot.elements.map((element) => element.node_id));
  for (const element of snapshot.elements) {
    for (const nodeId of [
      element.relationships.nearest_emitted_parent_node_id,
      element.relationships.nearest_positioned_ancestor_node_id,
      element.relationships.nearest_scroll_ancestor_node_id,
      element.relationships.nearest_clipping_ancestor_node_id,
    ]) {
      if (nodeId !== null && !nodes.has(nodeId))
        throw new Error("Snapshot relationship references a non-emitted node.");
    }
  }
}

function validateSnapshotBindings(snapshot: RuntimeSnapshot): void {
  for (const element of snapshot.elements) {
    const binding = element.source_binding;
    if (
      binding.binding_state === "EXACT" &&
      (!binding.source_element_key ||
        !binding.source_record_sha256 ||
        !binding.unique_in_runtime_document ||
        binding.unique_in_source_document !== true)
    ) {
      throw new Error("Exact source binding is missing uniqueness or source evidence.");
    }
  }
}

function aggregateDiagnosticsFromSnapshots(
  snapshots: readonly RuntimeSnapshot[],
): readonly Diagnostic[] {
  return canonicalDiagnosticSet(snapshots.flatMap((snapshot) => snapshot.diagnostics));
}

function canonicalDiagnosticSet(items: readonly Diagnostic[]): readonly Diagnostic[] {
  const unique = new Map<string, Diagnostic>();
  for (const item of items) {
    const key = canonicalJson(item);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.entries()]
    .sort(([left], [right]) => compareCanonicalStrings(left, right))
    .map(([, item]) => item);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareCanonicalStrings);
}
