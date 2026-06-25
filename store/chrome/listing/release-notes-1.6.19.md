# EDIS Runtime Collector 1.6.19

This maintenance release improves personal runtime provenance for local evidence packages.

- Synchronizes the runtime producer version with the extension release version.
- Adds non-sensitive runtime export provenance diagnostics, including extension release version, collector engine version, schema versions, IndexedDB version, browser family/version, extension ID when available, and manifest object hash when available.
- Uses runtime provenance entropy for new session and package identifiers to avoid cross-browser package identity collisions in separate Chrome and Edge profiles.
- Updates the personal release audit script to derive browser suite and repository test counts from current evidence instead of stale numeric constants.
- Adds a lightweight personal runtime package validator for manually exported evidence packages.

No permissions or host permissions were added. No network behavior was added. IndexedDB, protocol, and runtime snapshot schema versions remain unchanged.
