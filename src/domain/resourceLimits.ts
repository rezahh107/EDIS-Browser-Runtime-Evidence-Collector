/**
 * Local implementation safety limits. These limits do not alter the evidence schema;
 * they prevent captures that cannot be exported within the deterministic ZIP32 policy.
 */
export const MAX_ZIP_ENTRY_COUNT = 10_000;
export const MAX_ZIP_ENTRY_BYTES = 64_000_000;
export const MAX_ZIP_PAYLOAD_BYTES = 256_000_000;

/**
 * Leaves deterministic headroom for generated artifacts, embedded schemas, manifests,
 * checksums, and ZIP headers. Raw snapshots plus screenshots may not exceed this value.
 */
export const MAX_SESSION_EVIDENCE_BYTES = 220_000_000;

export const MAX_SCREENSHOT_BYTES = 16_000_000;
export const MAX_SESSION_CAPTURE_COUNT = 1_000;
export const STORAGE_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1_000;
