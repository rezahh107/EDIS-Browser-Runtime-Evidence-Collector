# EDIS Runtime Collector 1.6.15

- Hardens browser qualification so a passing report must identify and hash the actual browser executable, extension build, manifest, extension ID, service worker, platform, and Playwright evidence.
- Adds deterministic cycle, depth, node-count, and collection-size guards to canonical JSON processing.
- Replaces new zero-hash chunk records with verified SHA-256 and handles legacy records fail-closed unless a complete snapshot checksum is available.
- Adds IndexedDB v3-to-v4 migration, legacy recovery, canonical boundary, and qualification-audit regression tests.

No new permission, remote service, evidence schema, tracking behavior, or network feature was added.
