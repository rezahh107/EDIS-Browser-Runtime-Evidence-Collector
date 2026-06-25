# EDIS Runtime Collector 1.6.11 — Performance Hardening

```yaml
extension_version: 1.6.11
release_date: 2026-06-19
implementation_status: implemented
architecture_status: preserved
runtime_snapshot_schema: 1.6.0
runtime_package_manifest_schema: 1.4.1
```

Version 1.6.11 implements the verified performance fixes from the 1.6.10 audit. It does not add Browser-owned resolution, breakpoint inference, formula evaluation, correlation, rule execution, geometry normalization, or UX analysis.

## Implemented

- One capture-scoped measurement context for computed style, rectangle, visibility, ancestor relations, identities, and stable DOM references.
- One identity index per capture and no per-reference selector uniqueness scans.
- Immutable source-binding indexes and cached source-section/page evidence.
- One-pass text-node preparation, cached line evidence, singleton segmenters, and allocation-free segment counting.
- Mutation-aware viewport-image candidate sessions with reusable decode promises and cleanup.
- Generator-based content chunking and preallocated background assembly under the unchanged string transport protocol.
- Dedicated export worker for package construction, validation, hashing, and ZIP creation.
- Table-driven CRC32 and direct single-buffer ZIP32 writing.
- Digest and schema-pattern caches plus linear stable-key `uniqueItems` validation.
- Cursor-based IndexedDB maintenance and aggregate-backed capture status.
- Adaptive bounded status polling and non-overlapping capture-guard refresh.

## Contract and compatibility

No evidence schema version changed. No browser permission, host permission, public artifact layout, canonicalization profile, checksum algorithm, or cross-product ownership boundary changed. The added caches and worker protocol are internal execution mechanisms only.

## Known limitation

The content-to-background snapshot transport remains string-based because replacing it with binary transport would alter the existing internal compatibility surface and requires separate browser-runtime qualification. The implementation removes retained chunk arrays and preallocates final bytes, but cannot eliminate the producer canonical string or the consumer parsed object graph.

Browser runtime E2E is still `insufficient_evidence` in the current managed environment. Real Chrome/Edge Performance and Memory profiles are still required to quantify browser-specific gains.
