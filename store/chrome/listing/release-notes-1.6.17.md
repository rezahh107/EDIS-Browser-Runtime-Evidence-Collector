# Release notes — 1.6.17

This evidence-hardening release keeps the existing local-only Manifest V3 permission model and does not change the Runtime Snapshot, Package, or IndexedDB schema versions.

- Regenerates release artifact identity from the exact source, Chrome, and Edge ZIP files instead of stale manual file counts.
- Adds exact-packaged-artifact browser qualification gates that cannot pass unless the final Chrome or Edge ZIP is executed on the requested Stable browser.
- Records precise `INSUFFICIENT_EVIDENCE` reasons when Google Chrome Stable or Microsoft Edge Stable is unavailable.
- Adds storage reliability fixtures for fresh, existing, migrated, partial, corrupt-current, corrupt-legacy, legacy zero-hash, and mixed valid/corrupt states.
- Adds deterministic snapshot and screenshot size-boundary coverage.
- Strengthens diagnostic failure-boundary classification and response-envelope validation.
- Adds document binding, navigation, restricted-page, and service-worker recovery regression coverage.

No host permissions, telemetry, analytics, network behavior, remote code, automatic upload, or permission expansion were added.
