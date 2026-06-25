# EDIS Runtime Collector 1.6.7 — Minimum Python Feed Workflow

```yaml
extension_version: 1.6.7
runtime_snapshot_schema: 1.5.0
runtime_package_manifest_schema: 1.4.1
observation_set_schema: 1.1.0
python_feed_readiness_schema: 1.0.0
release_type: workflow_hardening
```

## Implemented

1. Added explicit requested viewport provenance: `DESKTOP`, `TABLET`, `MOBILE`, or `CUSTOM`, stored separately from the measured viewport dimensions.
2. Added deterministic `validation/python-feed-readiness.json` with `READY`, `INSUFFICIENT_EVIDENCE`, or `INVALID` state.
3. Added a separate `Minimum Python Feed` export path. It is allowed only when:
   - the exact imported WordPress Source Context is present and hash-valid;
   - a source document is explicitly selected and confirmed;
   - at least three observations exist;
   - at least three measured viewport widths are distinct;
   - Desktop, Tablet, and Mobile requested profiles are all present;
   - all observations share one runtime page fingerprint;
   - all observations reference the same Source Context;
   - observation indexes are unique and contiguous.
4. Embedded the canonical imported WordPress Source Context at `source-context/wordpress-source-context.json` only in the minimum-feed export.
5. Added cross-artifact external validation for the source hash, required profiles, distinct widths, page fingerprint, and readiness declaration.
6. Preserved ordinary runtime-evidence export for incomplete or single-observation sessions.
7. Automatically attaches a newly imported or newly selected Source Context to the current session only while the session is empty. Sessions with captures are never rewritten retroactively.
8. Added guided profile controls and distinct export actions in the side panel.

## Architectural status

The Browser Collector still records and packages evidence only. It does not perform final source/runtime correlation, breakpoint resolution, Variable/Class resolution, formula evaluation, scoring, rule execution, or UX conclusions. Requested profiles are provenance labels and do not establish Elementor breakpoint truth.

## Verification

- Repository tests: 162/162 passed.
- Unit: 92 passed.
- Security: 11 passed.
- Integration: 59 passed.
- Schema validation: 20 documents, 19 unique identifiers, exact index coverage.
- Browser runtime E2E remains environment-dependent and must not be claimed until executed in a browser that permits unpacked extensions.
