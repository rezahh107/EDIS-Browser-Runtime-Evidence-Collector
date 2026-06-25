import { diagnostic, type Diagnostic } from "../domain/diagnostics";
import {
  COLLECTOR_VERSION,
  RUNTIME_PACKAGE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type CaptureSession,
} from "../domain/model";
import { sha256Hex } from "./checksum";
import { DB_NAME, DB_VERSION } from "./storage/indexedDb";

export interface ExtensionRuntimeProvenance {
  readonly collector_engine_version: string;
  readonly extension_release_version: string;
  readonly manifest_version: string | null;
  readonly extension_id: string | null;
  readonly manifest_sha256: string | null;
  readonly extension_zip_sha256: string | null;
  readonly extension_zip_sha256_status: "UNAVAILABLE_AT_RUNTIME";
  readonly exported_package_sha256: string | null;
  readonly exported_package_sha256_status: "COMPUTED_AFTER_ZIP_CREATION";
  readonly browser_family: string | null;
  readonly browser_version: string | null;
  readonly runtime_snapshot_schema_version: string;
  readonly runtime_package_schema_version: string;
  readonly indexeddb_name: string;
  readonly indexeddb_version: number;
}

export async function collectExtensionRuntimeProvenance(
  session: CaptureSession,
): Promise<ExtensionRuntimeProvenance> {
  const manifest = safeGetManifest();
  const runtime = safeRuntime();
  const extensionId = typeof runtime?.id === "string" && runtime.id.length > 0 ? runtime.id : null;
  return {
    collector_engine_version: COLLECTOR_VERSION,
    extension_release_version: manifest?.version ?? session.data.extension_version,
    manifest_version: manifest?.version ?? null,
    extension_id: extensionId,
    manifest_sha256: await readManifestSha256(manifest),
    extension_zip_sha256: null,
    extension_zip_sha256_status: "UNAVAILABLE_AT_RUNTIME",
    exported_package_sha256: null,
    exported_package_sha256_status: "COMPUTED_AFTER_ZIP_CREATION",
    browser_family:
      session.data.browser_family || (session.data.runtime_environment?.browser_family ?? null),
    browser_version:
      session.data.browser_version ?? session.data.runtime_environment?.browser_version ?? null,
    runtime_snapshot_schema_version: SCHEMA_VERSION,
    runtime_package_schema_version: RUNTIME_PACKAGE_SCHEMA_VERSION,
    indexeddb_name: DB_NAME,
    indexeddb_version: DB_VERSION,
  };
}

export function extensionProvenanceDiagnostic(provenance: ExtensionRuntimeProvenance): Diagnostic {
  return diagnostic(
    "EDIS_RUNTIME_EXPORT_PROVENANCE",
    "INFO",
    "Runtime export provenance was recorded without sensitive page data.",
    true,
    {
      collector_engine_version: provenance.collector_engine_version,
      extension_release_version: provenance.extension_release_version,
      manifest_version: provenance.manifest_version,
      extension_id: provenance.extension_id,
      manifest_sha256: provenance.manifest_sha256,
      extension_zip_sha256: provenance.extension_zip_sha256,
      extension_zip_sha256_status: provenance.extension_zip_sha256_status,
      exported_package_sha256: provenance.exported_package_sha256,
      exported_package_sha256_status: provenance.exported_package_sha256_status,
      browser_family: provenance.browser_family,
      browser_version: provenance.browser_version,
      runtime_snapshot_schema_version: provenance.runtime_snapshot_schema_version,
      runtime_package_schema_version: provenance.runtime_package_schema_version,
      indexeddb_name: provenance.indexeddb_name,
      indexeddb_version: provenance.indexeddb_version,
    },
    "OPERATIONAL",
  );
}

interface RuntimeContextLike {
  readonly id?: string;
  getManifest?: () => chrome.runtime.Manifest;
}

function safeRuntime(): RuntimeContextLike | null {
  const candidate = globalThis.chrome?.runtime;
  return candidate && typeof candidate === "object" ? candidate : null;
}

function safeGetManifest(): chrome.runtime.Manifest | null {
  const runtime = safeRuntime();
  try {
    const manifest = runtime?.getManifest?.();
    return manifest && typeof manifest === "object" ? manifest : null;
  } catch {
    return null;
  }
}

async function readManifestSha256(
  manifest: chrome.runtime.Manifest | null,
): Promise<string | null> {
  if (!manifest) return null;
  return sha256Hex(JSON.stringify(manifest));
}
