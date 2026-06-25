# Implementation Decisions

## Build tool

esbuild bundles local TypeScript modules without runtime dependencies. Production output contains no source maps or remote assets.

## ZIP implementation

A tested store-only ZIP writer emits UTF-8 paths, CRC-32, central-directory records, deterministic ordering, fixed timestamps, and safe relative paths. Compression is omitted to simplify review and avoid a runtime dependency.

## Storage architecture

Extension-local storage contains preferences. Session storage contains only small active-job coordination keys. IndexedDB contains versioned sessions, jobs, chunks, snapshots, and optional screenshot bytes.

## Message validation

A versioned protocol uses exact envelope keys, UUID request IDs, runtime payload checks, sender and origin checks, tab and URL binding, active-job checks, timeouts, cancellation, chunk limits, and conflicting-duplicate detection.

## Element identity

Real Elementor identifiers have the highest confidence. Sanitized stable HTML IDs and bounded structural references follow. Random-looking or sensitive identifiers are discarded.

## Computed styles

Only an explicit layout, sizing, flex/grid, spacing, typography, visibility, and optional color allowlist is collected. Raw strings are preserved for downstream deterministic analysis.

## Screenshot

Only the visible active viewport is supported. It requires explicit opt-in, is size bounded, is stored separately, and receives an independent SHA-256 checksum.

## Excluded powerful access

The release excludes broad host permissions, debugger, cookies, history, web request, native messaging, clipboard, geolocation, and management permissions.


## Hidden subtree pruning

When hidden collection is disabled, the bounded walker evaluates effective visibility before queuing descendants. A hidden subtree is pruned and counted. Only the direct-child lower bound is recorded; the collector does not perform a second unbounded walk to claim an exact omitted descendant count.

## Runtime instance and cardinality evidence

Direct validated source markers form candidate groups. Repeated groups are labeled `REPEATED_TEMPLATE` only for validated `loop-item` source documents; otherwise they remain `MULTIPLE_RUNTIME_ROOTS`. Candidate counts never become final correlation.

## Computed-style origin

Version 1.6.9 records availability and feed readiness only. CSSOM rule inspection and Variable/Class origin attribution are deliberately not implemented.
