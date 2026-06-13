import { canonicalJson } from "../domain/canonical";
import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import {
  COLLECTOR_ID,
  COLLECTOR_VERSION,
  SCHEMA_VERSION,
  type ArtifactEnvelope,
  type CaptureSession,
  type RuntimeSnapshot,
  type ScreenshotRecord,
} from "../domain/model";
import { isRuntimeSnapshot } from "../domain/validation";
import { sha256Hex } from "./checksum";
import { createStoreZip, type ZipEntry } from "./zip";

export interface EvidencePackageInput {
  readonly session: CaptureSession;
  readonly snapshots: readonly RuntimeSnapshot[];
  readonly screenshots: readonly ScreenshotRecord[];
}

export interface BuiltEvidencePackage {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly entryCount: number;
}

export async function buildEvidencePackage(
  input: EvidencePackageInput,
): Promise<BuiltEvidencePackage> {
  validateInput(input);
  const encoder = new TextEncoder();
  const sessionId = input.session.data.session_id;
  const entries = new Map<string, Uint8Array>();
  const capturedAt =
    input.snapshots.map((snapshot) => snapshot.captured_at).sort()[0] ?? input.session.captured_at;
  const page = input.snapshots[0]?.data.page ?? null;
  entries.set(
    "page-context.json",
    encoder.encode(canonicalJson(envelope("page_context", capturedAt, page, []))),
  );
  entries.set(
    `sessions/session-${sessionId}/session.json`,
    encoder.encode(canonicalJson(input.session)),
  );

  for (const [index, snapshot] of [...input.snapshots]
    .sort((a, b) => a.data.snapshot_id.localeCompare(b.data.snapshot_id))
    .entries()) {
    const name = `viewport-${String(index + 1).padStart(3, "0")}`;
    entries.set(
      `sessions/session-${sessionId}/snapshots/${name}.json`,
      encoder.encode(canonicalJson(snapshot)),
    );
    const screenshot = input.screenshots.find(
      (item) => item.snapshotId === snapshot.data.snapshot_id,
    );
    if (screenshot)
      entries.set(
        `sessions/session-${sessionId}/screenshots/${name}.png`,
        new Uint8Array(screenshot.bytes),
      );
  }

  const diagnostics = input.snapshots.flatMap((snapshot) => snapshot.diagnostics);
  entries.set(
    "diagnostics.json",
    encoder.encode(canonicalJson(envelope("diagnostics", capturedAt, diagnostics, diagnostics))),
  );
  entries.set(
    "schemas/schema-index.json",
    encoder.encode(
      canonicalJson(
        envelope(
          "schema_index",
          capturedAt,
          {
            schemas: [
              "artifact-envelope.schema.json",
              "runtime-snapshot.schema.json",
              "capture-session.schema.json",
              "diagnostic.schema.json",
              "package-manifest.schema.json",
            ],
          },
          [],
        ),
      ),
    ),
  );
  entries.set(
    "README.txt",
    encoder.encode(
      "EDIS Browser Runtime Evidence Package\n\nThis local package contains rendered-page facts. It does not contain UX scores or recommendations. Validate checksums before importing into EDIS Python.\n",
    ),
  );

  const fileRecords = await hashEntries(entries);
  const packageManifest = envelope(
    "package_manifest",
    capturedAt,
    {
      package_id: sessionId,
      session_id: sessionId,
      package_status: "COMPLETE",
      files: fileRecords,
      screenshot_count: input.screenshots.length,
      snapshot_count: input.snapshots.length,
    },
    diagnostics,
  );
  const manifestBytes = encoder.encode(canonicalJson(packageManifest));
  entries.set("package-manifest.json", manifestBytes);
  const manifestHash = await sha256Hex(manifestBytes);
  const checksumLines =
    [
      `${manifestHash}  package-manifest.json`,
      ...fileRecords.map((record) => `${record.sha256}  ${record.path}`),
    ]
      .sort()
      .join("\n") + "\n";
  entries.set("checksums.sha256", encoder.encode(checksumLines));

  const zipEntries: ZipEntry[] = [...entries.entries()].map(([path, data]) => ({ path, data }));
  return {
    bytes: createStoreZip(zipEntries),
    filename: `edis-runtime-package-${sessionId}.zip`,
    entryCount: zipEntries.length,
  };
}

function envelope<T>(
  artifactType: string,
  capturedAt: string,
  data: T,
  diagnostics: readonly Diagnostic[],
): ArtifactEnvelope<T> {
  return {
    schema_version: SCHEMA_VERSION,
    artifact_type: artifactType,
    status: diagnostics.some((item) => item.severity === "FATAL")
      ? "FAILED"
      : diagnostics.length > 0
        ? "PARTIAL"
        : "AVAILABLE",
    source: { collector_id: COLLECTOR_ID, collector_version: COLLECTOR_VERSION },
    captured_at: capturedAt,
    data,
    diagnostics,
  };
}

async function hashEntries(
  entries: ReadonlyMap<string, Uint8Array>,
): Promise<readonly { path: string; bytes: number; sha256: string }[]> {
  const records = [];
  for (const [path, data] of [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    records.push({ path, bytes: data.length, sha256: await sha256Hex(data) });
  }
  return records;
}

function validateInput(input: EvidencePackageInput): void {
  if (input.snapshots.length === 0)
    throw new Error("A complete package requires at least one snapshot.");
  if (input.session.data.status === "FAILED" || input.session.data.status === "CAPTURING")
    throw new Error("Session is not exportable.");
  for (const snapshot of input.snapshots) {
    if (!isRuntimeSnapshot(snapshot)) throw new Error("Stored snapshot failed runtime validation.");
    if (snapshot.data.session_id !== input.session.data.session_id)
      throw new Error("Snapshot belongs to a different session.");
  }
  const unique = new Set(input.snapshots.map((snapshot) => snapshot.data.snapshot_id));
  if (unique.size !== input.snapshots.length) {
    throw new Error(
      diagnostic(
        "EDIS_RUNTIME_EXPORT_VALIDATION_FAILED",
        "FATAL",
        "Duplicate snapshots prevent export.",
        false,
      ).message,
    );
  }
}
