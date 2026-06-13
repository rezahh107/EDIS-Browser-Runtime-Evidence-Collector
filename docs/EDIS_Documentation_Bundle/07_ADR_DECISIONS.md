# Architecture Decision Records

## ADR-001: Local-only design
No network communication allowed.

## ADR-002: IndexedDB storage
Required for large snapshot handling.

## ADR-003: No debugger API
Security risk too high for v1.

## ADR-004: Chunked messaging
Prevents service worker overflow.

## ADR-005: No persistent observers
Prevents background tracking.