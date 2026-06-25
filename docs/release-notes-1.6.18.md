# EDIS Runtime Collector 1.6.18 Release Notes

Title: Browser Qualification Gate Repair & Exact Stable Runtime Evidence

This release is a narrow release-gate and evidence-integrity patch over 1.6.17.

## Changes

- Bumped extension/package/project version to `1.6.18`.
- Replaced stale browser qualification count assumptions with `tests/e2e/browser-qualification-contract.json`.
- Updated browser qualification aggregation to require the current 32-test suite per production target.
- Updated full release gate semantics so full release readiness requires both Chrome and Edge target evidence.
- Improved human-readable release evidence so `NO_BROWSER_RUNTIME_EVIDENCE`, Chrome reason, Edge reason, executed browser-test count, and exact qualification booleans are visible in Markdown.
- Added aggregator regression tests for valid 32-test evidence, stale 29-test evidence, missing tests, duplicates, unexpected tests, unavailable evidence, and single-browser partial qualification.
- Added export worker transfer/retry protection so failed worker transfer does not detach the caller-owned screenshot buffers used for retry.

## Release status

`NO_GO`: exact Chrome Stable and exact Microsoft Edge Stable packaged-artifact runtime qualification were unavailable in this environment.

## Scope explicitly preserved

- No host permissions were added.
- Existing extension permissions were preserved.
- IndexedDB version remained `4`.
- Protocol/runtime snapshot schema versions were not changed.
- No multi-frame expansion or cosmetic rewrite was performed.
