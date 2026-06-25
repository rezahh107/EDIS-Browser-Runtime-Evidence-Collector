import type { Diagnostic } from "./diagnostics";
import {
  CANONICALIZATION_PROFILE,
  COLLECTOR_VERSION,
  HASH_ALGORITHM,
  type ArtifactEnvelope,
} from "./model";

export function makeEnvelope<T>(
  schemaId: string,
  schemaVersion: string,
  artifactType: string,
  capturedAt: string,
  data: T,
  diagnostics: readonly Diagnostic[] = [],
): ArtifactEnvelope<T> {
  return {
    schema_id: schemaId,
    schema_version: schemaVersion,
    artifact_type: artifactType,
    producer: {
      product: "EDIS Browser Runtime Evidence Collector",
      version: COLLECTOR_VERSION,
    },
    captured_at: capturedAt,
    canonicalization: {
      profile: CANONICALIZATION_PROFILE,
      hash_algorithm: HASH_ALGORITHM,
    },
    data,
    diagnostics,
  };
}
