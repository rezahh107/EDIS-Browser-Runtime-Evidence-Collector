# Store Reviewer Guide

## Single purpose

The extension records rendered-page runtime evidence for local export to EDIS Python. It does not score UX, modify pages, monitor browsing, or transmit evidence.

## Review steps

1. Build the Chrome target and load `dist/chrome` unpacked.
2. Open a normal HTTP or HTTPS test page.
3. Invoke the toolbar action and verify the page status.
4. Create a session, capture the current viewport, and inspect the capture list.
5. Keep screenshot and text-preview toggles disabled and export a ZIP.
6. Confirm the ZIP contains JSON evidence, schemas, diagnostics, checksums, and no network destination.
7. Enable screenshot only after the warning, capture again, and verify that only the visible viewport is included.
8. Open an internal browser page or store page and verify a clear unsupported-page result.
9. Use the options page to clear all data.

Network inspection should show no collector-originated remote requests. The source contains no telemetry or analytics endpoint. Permission explanations are in `docs/permission-justification.md`.
