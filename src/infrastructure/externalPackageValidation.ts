import { canonicalJson, parseSafeJson } from "../domain/canonical";
import { assertElementorMetricInvariant } from "../domain/elementorMetrics";
import { assertExactPathSet, exactPackageInventory } from "../domain/packageInventory";
import { sha256Digest } from "./checksum";
import { validateJsonSchema, type SchemaRegistry } from "./schemaValidation";
import { parseStoreZip } from "./zipReader";

export interface ExternalPackageValidationResult {
  readonly validation_state: "PASS" | "FAIL";
  readonly artifact_count: number;
  readonly schema_count: number;
  readonly schema_id_resolution_count: number;
  readonly issues: readonly string[];
}

interface SchemaIndexEntry {
  readonly path: string;
  readonly schema_id: string;
  readonly version: string;
}

export async function validateEvidencePackageArchive(
  bytes: Uint8Array,
): Promise<ExternalPackageValidationResult> {
  const issues: string[] = [];
  try {
    const entries = parseStoreZip(bytes);
    const entryPaths = entries.map((entry) => entry.path);
    const byPath = new Map(entries.map((entry) => [entry.path, entry.bytes] as const));
    if (byPath.size !== entries.length) throw new Error("ZIP contains duplicate paths.");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const digestCache = new Map<string, Promise<string>>();
    const digestForPath = (path: string): Promise<string> => {
      const cached = digestCache.get(path);
      if (cached) return cached;
      const entry = byPath.get(path);
      if (!entry) return Promise.reject(new Error(`Required package entry is missing: ${path}`));
      const digest = sha256Digest(entry);
      digestCache.set(path, digest);
      return digest;
    };
    const parseJson = (path: string): unknown => {
      const entry = byPath.get(path);
      if (!entry) throw new Error(`Required package entry is missing: ${path}`);
      return parseSafeJson(decoder.decode(entry));
    };

    const packageManifest = parseJson("package-manifest.json");
    const manifestPaths = readManifestPaths(packageManifest);
    const inventory = exactPackageInventory(manifestPaths);
    assertExactPathSet(entryPaths, inventory.zipPaths, "ZIP");

    const index = parseJson("schemas/schema-index.json");
    const indexEntries = readSchemaIndex(index);
    const registry: Record<string, unknown> = {};
    const schemaPathById = new Map<string, string>();
    for (const item of indexEntries) {
      if (schemaPathById.has(item.schema_id))
        throw new Error(`Duplicate schema identifier in schema index: ${item.schema_id}`);
      const embeddedPath = `schemas/${item.path}`;
      const schema = parseJson(embeddedPath);
      if (!isRecord(schema) || schema.$id !== item.schema_id)
        throw new Error(`Schema index identifier mismatch: ${item.path}`);
      registry[item.path] = schema;
      schemaPathById.set(item.schema_id, item.path);
    }

    const indexIssues = validateJsonSchema(index, "schema-index.schema.json", registry);
    if (indexIssues.length > 0)
      throw new Error(
        `Schema index validation failed at ${indexIssues[0]?.path ?? "$"}: ${indexIssues[0]?.message ?? "unknown error"}`,
      );

    let artifactCount = 0;
    let resolutionCount = 0;
    const runtimeSnapshots: Array<{
      readonly path: string;
      readonly snapshotId: string;
      readonly observationIndex: number;
      readonly pageFingerprint: string;
      readonly viewportWidth: number;
      readonly requestedProfileId: string;
    }> = [];
    let observationSet: unknown = null;
    let pythonFeedReadiness: unknown = null;
    let sourceContext: unknown = null;
    let sourceContextReference: unknown = null;
    for (const [path, entry] of byPath) {
      if (!path.endsWith(".json")) continue;
      if (path.startsWith("schemas/") && path !== "schemas/schema-index.json") continue;
      const text = decoder.decode(entry);
      const artifact = parseSafeJson(text);
      if (canonicalJson(artifact) !== text)
        throw new Error(`Artifact JSON is not canonical: ${path}`);
      if (!isRecord(artifact) || typeof artifact.schema_id !== "string")
        throw new Error(`Artifact does not declare schema_id: ${path}`);
      const schemaPath = schemaPathById.get(artifact.schema_id);
      if (!schemaPath)
        throw new Error(`Artifact schema_id is not registered: ${artifact.schema_id}`);
      resolutionCount += 1;
      const artifactIssues = validateJsonSchema(artifact, schemaPath, registry as SchemaRegistry);
      if (artifactIssues.length > 0)
        throw new Error(
          `Artifact validation failed for ${path} at ${artifactIssues[0]?.path ?? "$"}: ${artifactIssues[0]?.message ?? "unknown error"}`,
        );
      if (artifact.artifact_type === "runtime_snapshot") {
        runtimeSnapshots.push(readRuntimeSnapshotInvariantRecord(path, artifact));
      } else if (artifact.artifact_type === "observation_set") {
        observationSet = artifact;
      } else if (artifact.artifact_type === "python_feed_readiness") {
        pythonFeedReadiness = artifact;
      } else if (artifact.artifact_type === "edis_source_context") {
        sourceContext = artifact;
      } else if (artifact.artifact_type === "source_context_reference") {
        sourceContextReference = artifact;
      }
      artifactCount += 1;
    }

    validateRuntimeArtifactGraph(runtimeSnapshots, observationSet);
    await validatePythonFeedArtifacts(
      runtimeSnapshots,
      pythonFeedReadiness,
      sourceContext,
      sourceContextReference,
    );
    await validateManifest(byPath, packageManifest, digestForPath);
    await validateChecksums(byPath, decoder, digestForPath, inventory.checksumPaths);
    return {
      validation_state: "PASS",
      artifact_count: artifactCount,
      schema_count: indexEntries.length,
      schema_id_resolution_count: resolutionCount,
      issues: [],
    };
  } catch (error: unknown) {
    issues.push(error instanceof Error ? error.message : String(error));
    return {
      validation_state: "FAIL",
      artifact_count: 0,
      schema_count: 0,
      schema_id_resolution_count: 0,
      issues,
    };
  }
}

function readManifestPaths(value: unknown): readonly string[] {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.files))
    throw new Error("Package manifest file inventory is invalid.");
  return value.data.files.map((item) => {
    if (!isRecord(item) || typeof item.path !== "string")
      throw new Error("Package manifest contains an invalid file record.");
    return item.path;
  });
}

async function validateManifest(
  entries: ReadonlyMap<string, Uint8Array>,
  value: unknown,
  digestForPath: (path: string) => Promise<string>,
): Promise<void> {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.files))
    throw new Error("Package manifest file inventory is invalid.");
  const paths = new Set<string>();
  for (const item of value.data.files) {
    if (
      !isRecord(item) ||
      typeof item.path !== "string" ||
      typeof item.bytes !== "number" ||
      typeof item.sha256 !== "string"
    )
      throw new Error("Package manifest contains an invalid file record.");
    if (paths.has(item.path)) throw new Error(`Package manifest repeats path: ${item.path}`);
    const bytes = entries.get(item.path);
    if (!bytes) throw new Error(`Package manifest references a missing file: ${item.path}`);
    if (bytes.length !== item.bytes)
      throw new Error(`Package manifest size mismatch: ${item.path}`);
    if ((await digestForPath(item.path)) !== item.sha256)
      throw new Error(`Package manifest checksum mismatch: ${item.path}`);
    paths.add(item.path);
  }
}

async function validateChecksums(
  entries: ReadonlyMap<string, Uint8Array>,
  decoder: TextDecoder,
  digestForPath: (path: string) => Promise<string>,
  expectedPaths: ReadonlySet<string>,
): Promise<void> {
  const checksumBytes = entries.get("checksums.sha256");
  if (!checksumBytes) throw new Error("checksums.sha256 is missing.");
  const text = decoder.decode(checksumBytes);
  const parsedLines = text
    .trimEnd()
    .split("\n")
    .map((line) => {
      const match = /^(sha256:[0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) throw new Error("Checksum inventory is malformed.");
      return { digest: match[1] ?? "", path: match[2] ?? "" };
    });
  assertExactPathSet(
    parsedLines.map((line) => line.path),
    expectedPaths,
    "Checksum",
  );
  for (const line of parsedLines) {
    const bytes = entries.get(line.path);
    if (!bytes) throw new Error(`Checksum inventory references a missing file: ${line.path}`);
    if ((await digestForPath(line.path)) !== line.digest)
      throw new Error(`Checksum inventory mismatch: ${line.path}`);
  }
}

function readSchemaIndex(value: unknown): readonly SchemaIndexEntry[] {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.schemas))
    throw new Error("Embedded schema index is invalid.");
  return value.data.schemas.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.path !== "string" ||
      typeof item.schema_id !== "string" ||
      typeof item.version !== "string"
    )
      throw new Error("Embedded schema index contains an invalid record.");
    return { path: item.path, schema_id: item.schema_id, version: item.version };
  });
}

function readRuntimeSnapshotInvariantRecord(
  path: string,
  artifact: Record<string, unknown>,
): {
  readonly path: string;
  readonly snapshotId: string;
  readonly observationIndex: number;
  readonly pageFingerprint: string;
  readonly viewportWidth: number;
  readonly requestedProfileId: string;
} {
  if (!isRecord(artifact.data) || !isRecord(artifact.data.document_metrics))
    throw new Error(`Runtime snapshot document metrics are missing: ${path}`);
  const metrics = artifact.data.document_metrics;
  const discovered = readNonNegativeInteger(metrics.discovered_elementor_elements);
  const emitted = readNonNegativeInteger(metrics.emitted_elementor_elements);
  const skipped = readNonNegativeInteger(metrics.skipped_elementor_elements);
  assertElementorMetricInvariant({
    discovered_elementor_elements: discovered,
    emitted_elementor_elements: emitted,
    skipped_elementor_elements: skipped,
  });
  if (
    typeof artifact.data.snapshot_id !== "string" ||
    !isRecord(artifact.data.page) ||
    typeof artifact.data.page.page_fingerprint !== "string" ||
    !isRecord(artifact.data.viewport) ||
    typeof artifact.data.viewport.inner_width !== "number" ||
    typeof artifact.data.viewport.requested_profile_id !== "string"
  )
    throw new Error(`Runtime snapshot feed metadata is missing: ${path}`);
  return {
    path,
    snapshotId: artifact.data.snapshot_id,
    observationIndex: readNonNegativeInteger(artifact.data.observation_index),
    pageFingerprint: artifact.data.page.page_fingerprint,
    viewportWidth: artifact.data.viewport.inner_width,
    requestedProfileId: artifact.data.viewport.requested_profile_id,
  };
}

function validateRuntimeArtifactGraph(
  snapshots: readonly {
    readonly path: string;
    readonly snapshotId: string;
    readonly observationIndex: number;
    readonly pageFingerprint: string;
    readonly viewportWidth: number;
    readonly requestedProfileId: string;
  }[],
  observationSet: unknown,
): void {
  if (snapshots.length === 0) throw new Error("Package contains no runtime snapshot artifacts.");
  const indexes = snapshots.map((item) => item.observationIndex).sort((a, b) => a - b);
  if (new Set(indexes).size !== indexes.length)
    throw new Error("EDIS_RUNTIME_DUPLICATE_OBSERVATION_INDEX: snapshot indexes must be unique.");
  if (indexes.some((value, index) => value !== index))
    throw new Error(
      "EDIS_RUNTIME_NON_CONTIGUOUS_OBSERVATION_INDEX: snapshot indexes must be contiguous from zero.",
    );
  const snapshotIds = new Set(snapshots.map((item) => item.snapshotId));
  if (snapshotIds.size !== snapshots.length)
    throw new Error("EDIS_RUNTIME_ORPHAN_SNAPSHOT: duplicate runtime snapshot identifier.");
  if (
    !isRecord(observationSet) ||
    !isRecord(observationSet.data) ||
    !Array.isArray(observationSet.data.observations)
  )
    throw new Error("Observation set artifact is missing or invalid.");
  const observations = observationSet.data.observations;
  if (observations.length !== snapshots.length)
    throw new Error("EDIS_RUNTIME_MISSING_SNAPSHOT: observation set and snapshot counts differ.");
  const snapshotById = new Map(snapshots.map((item) => [item.snapshotId, item] as const));
  const seen = new Set<string>();
  for (const value of observations) {
    if (
      !isRecord(value) ||
      typeof value.snapshot_id !== "string" ||
      typeof value.snapshot_path !== "string"
    )
      throw new Error("Observation set contains an invalid runtime snapshot reference.");
    const snapshot = snapshotById.get(value.snapshot_id);
    if (!snapshot)
      throw new Error(
        "EDIS_RUNTIME_MISSING_SNAPSHOT: observation references a missing runtime snapshot.",
      );
    if (seen.has(value.snapshot_id))
      throw new Error("EDIS_RUNTIME_ORPHAN_SNAPSHOT: observation set repeats a runtime snapshot.");
    seen.add(value.snapshot_id);
    if (readNonNegativeInteger(value.observation_index) !== snapshot.observationIndex)
      throw new Error(
        "EDIS_RUNTIME_DUPLICATE_OBSERVATION_INDEX: observation index disagrees with runtime snapshot.",
      );
    if (value.snapshot_path !== snapshot.path)
      throw new Error(
        "EDIS_RUNTIME_ORPHAN_SNAPSHOT: observation path disagrees with runtime snapshot path.",
      );
  }
}

async function validatePythonFeedArtifacts(
  snapshots: readonly {
    readonly pageFingerprint: string;
    readonly viewportWidth: number;
    readonly requestedProfileId: string;
  }[],
  readinessArtifact: unknown,
  sourceContext: unknown,
  sourceContextReference: unknown,
): Promise<void> {
  if (readinessArtifact === null) throw new Error("Python feed readiness artifact is missing.");
  if (!isRecord(readinessArtifact) || !isRecord(readinessArtifact.data))
    throw new Error("Python feed readiness artifact is invalid.");
  const data = readinessArtifact.data;
  if (data.state !== "READY") return;

  if (!isRecord(sourceContext) || !isRecord(sourceContext.data))
    throw new Error("EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED: ready feed lacks Source Context.");
  if (!isRecord(sourceContextReference) || !isRecord(sourceContextReference.data))
    throw new Error(
      "EDIS_RUNTIME_SOURCE_CONTEXT_REQUIRED: ready feed lacks Source Context reference.",
    );
  const reference = sourceContextReference.data;
  if (reference.confirmation_state !== "CONFIRMED")
    throw new Error("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE: source document is not confirmed.");
  if (typeof reference.imported_source_context_sha256 !== "string")
    throw new Error("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE: source hash is missing.");
  const sourceHash = await sha256Digest(new TextEncoder().encode(canonicalJson(sourceContext)));
  if (sourceHash !== reference.imported_source_context_sha256)
    throw new Error("EDIS_RUNTIME_SOURCE_CONTEXT_INCOMPATIBLE: source hash mismatch.");

  if (snapshots.length < 3) throw new Error("EDIS_RUNTIME_INSUFFICIENT_RUNTIME_OBSERVATIONS");
  if (new Set(snapshots.map((item) => item.viewportWidth)).size < 3)
    throw new Error("EDIS_RUNTIME_INSUFFICIENT_DISTINCT_VIEWPORTS");
  const profiles = new Set(snapshots.map((item) => item.requestedProfileId));
  for (const profile of ["DESKTOP", "TABLET", "MOBILE"]) {
    if (!profiles.has(profile)) throw new Error("EDIS_RUNTIME_REQUIRED_VIEWPORT_PROFILE_MISSING");
  }
  if (new Set(snapshots.map((item) => item.pageFingerprint)).size !== 1)
    throw new Error("EDIS_RUNTIME_PAGE_FINGERPRINT_MISMATCH");
  if (
    data.export_allowed !== true ||
    !Array.isArray(data.blocking_codes) ||
    data.blocking_codes.length !== 0
  )
    throw new Error("EDIS_RUNTIME_PYTHON_FEED_NOT_READY: readiness fields disagree.");
}

function readNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Expected a non-negative safe integer in runtime artifact.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
