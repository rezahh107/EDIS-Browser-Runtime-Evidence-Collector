# Implementation Decisions

## Build tool

esbuild bundles local TypeScript modules without runtime dependencies. Production output excludes source maps and remote assets.

## ZIP implementation

A small tested store-only ZIP writer implements local file headers, UTF-8 names, CRC-32, central-directory records, safe relative paths, deterministic ordering, and fixed ZIP timestamps. Compression is intentionally omitted to avoid a runtime dependency and simplify review.

## Storage architecture

Sync storage contains only small preferences. Session storage contains small coordination records. IndexedDB contains versioned sessions, jobs, chunks, snapshots, and optional screenshot bytes. Migrations are idempotent.

## Message validation

A narrow versioned protocol uses discriminated message types, runtime payload checks, sender-ID and origin checks, tab binding for content messages, request correlation, timeouts, cancellation, and chunk-size limits.

## Browser abstraction

Domain code has no browser-specific types. Browser APIs are wrapped by an adapter. Chromium uses a service worker and Side Panel API; Firefox uses an experimental event-script manifest and sidebar fallback.

## Element identity

Real Elementor identifiers have the highest confidence. Documented markers and stable DOM references follow. References combine tag, bounded `nth-of-type` segments, sanitized stable identifiers, parent reference, and sibling index. Random IDs are not generated.

## Computed styles

Only an explicit layout, sizing, flex/grid, spacing, typography, and visibility allowlist is collected. Colors are optional and disabled by default. Raw strings are preserved for EDIS Python.

## Text privacy

Default evidence contains metrics rather than full text. Limited previews require opt-in and are never collected from form controls, password-like fields, authentication-like fields, card-like fields, or contenteditable regions under strict mode.

## Screenshot

Only the visible active viewport is supported. It requires explicit opt-in and temporary active-tab access. Screenshot and JSON hashes are independent, and screenshot failure is diagnostic only.

## Firefox boundary

Firefox keeps non-persistent background scripts rather than Chromium service workers. The adapter and fallback UI preserve the boundary, but a release claim waits for Firefox-specific end-to-end results.

## Excluded powerful access

The developer-protocol permission is excluded because DOM APIs satisfy version 1.0 and the permission is disproportionately powerful. Broad wildcard host access is excluded because temporary user-invoked active-tab access is sufficient.
