# EDIS Runtime Collector 1.6.9 — Guided Minimum Python Feed Capture

```yaml
extension_version: 1.6.9
release_type: workflow_hardening
architecture_status: unchanged
schema_breaking_change: false
```

## Purpose

Version 1.6.9 reduces failed or misleading capture attempts when preparing the minimum evidence feed for the deterministic Python Engine. It adds pre-capture guards and guided status only. It does not perform source resolution, breakpoint inference, correlation, formula evaluation, rule execution, or UX analysis.

## Implemented

- Explicit `RUNTIME_EVIDENCE` and `MINIMUM_PYTHON_FEED` capture modes.
- Target-page probe for the actual viewport and deterministic page fingerprint.
- Source Context gate before Minimum Python Feed capture.
- Duplicate required-profile and duplicate measured-width guards.
- Page-fingerprint and Source Context compatibility guards.
- Finalization recheck of the approved viewport width and page fingerprint.
- Guided Source/Desktop/Tablet/Mobile/export checklist in the side panel.
- Ordinary Runtime Evidence remains able to capture repeated widths.
- Shared page-fingerprint implementation used by both page collection and pre-capture probing.

## Verification

- Repository tests: 176/176 passed in 49 files.
- Unit: 102; security: 11; integration: 63.
- Remaining qualification results are recorded in `docs/release/test-results.md`.

## Evidence limitations

Real Chrome and Edge runtime E2E remains `insufficient_evidence` in the current managed container if unpacked extensions are blocked. A real matching WordPress Source Context plus three distinct viewport captures is still required to produce an actual `READY` Minimum Python Feed fixture.
