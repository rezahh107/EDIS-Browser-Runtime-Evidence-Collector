# EDIS Runtime Collector 1.6.5

This hardening release improves evidence-package interoperability and capture completeness without changing the frozen architectural boundary.

- Aligns the diagnostics artifact schema ID with the embedded schema index.
- Adds independent schema-ID-driven package validation.
- Adds `coverage/evidence-coverage.json` for explicit evidence availability.
- Adds export preflight coverage warnings.
- Adds bounded optional lazy-load preparation with scroll restoration.
- Extends capture-concurrency regression coverage.
- Preserves local-only operation, deterministic ZIP output, and the Runtime Package schema version `1.4.0`.

Browser runtime E2E remains `insufficient_evidence` in the release environment because managed Chromium policy blocks unpacked extensions. No unexecuted browser test is claimed as passed.
