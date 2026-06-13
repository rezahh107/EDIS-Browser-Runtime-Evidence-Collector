# Architecture

The extension is divided into Presentation, Application, Domain, and Infrastructure layers. Popup, side panel, and options pages call typed application use cases. Domain types, validation, canonical serialization, diagnostics, geometry, redaction, and session matching contain no Chrome-specific types. Infrastructure adapters isolate browser APIs, IndexedDB, screenshot capture, download initiation, checksums, and ZIP encoding.

Capture starts in an extension page after a user gesture. The service worker checkpoints a job before dynamic script injection. The transient content collector requests its job configuration, performs bounded traversal, serializes canonical evidence, and sends bounded chunks. The worker validates sender tab identity, persists every chunk, assembles and validates the snapshot, optionally captures the visible viewport, and marks the job complete. Navigation or worker interruption produces an explicit job state and diagnostic.

Large snapshots never rely on service-worker memory as their durable source. IndexedDB stores jobs, chunks, sessions, snapshots, and optional screenshot bytes. Browser session storage holds only small coordination keys. Sync storage holds non-sensitive preferences.

The package builder runs in the side-panel or fallback extension page, reads IndexedDB directly, validates artifacts, computes independent SHA-256 values, and creates a deterministic store-only ZIP. Core capture remains available through the popup and portable fallback page even when a browser has no Chromium side-panel API.
