# EDIS Runtime Collector 1.6.18

Release title: Browser Qualification Gate Repair & Exact Stable Runtime Evidence

This maintenance release repairs browser qualification release-gate evidence handling.

## Changes

- Browser qualification aggregation now uses the current 32-test suite contract instead of the stale 29-test assumption.
- Full release readiness requires both exact packaged Chrome Stable and exact packaged Microsoft Edge Stable qualification.
- Human-readable release evidence now explicitly shows browser-runtime limitations, including `NO_BROWSER_RUNTIME_EVIDENCE`, per-browser reasons, executed browser-test count, and exact qualification booleans.
- Added regression coverage for stale, missing, duplicate, unexpected, unavailable, and single-browser browser-qualification evidence.
- Hardened export worker screenshot transfer retry behavior.

## Release status

This package must not be submitted as store-ready until exact Chrome Stable and exact Microsoft Edge Stable packaged-artifact runtime evidence both pass.
