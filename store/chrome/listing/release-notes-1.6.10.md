# EDIS Runtime Collector 1.6.10 — Canonical Python Feed Guard

```yaml
extension_version: 1.6.10
runtime_snapshot_schema: 1.6.0
python_feed_readiness_schema: 1.1.0
capture_session_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
```

## Scope

Version 1.6.10 improves capture quality for the deterministic Python Engine. It adds no Browser-owned resolution, breakpoint inference, correlation, formula evaluation, rule execution, geometry normalization, or UX analysis.

## Implemented

- Locks the selected session workflow after the first capture.
- Preserves free capture order while requiring unique Desktop, Tablet, and Mobile requested profiles plus three distinct measured CSS-pixel widths.
- Requires canonical scroll `(0,0)` for Minimum Python Feed captures.
- Requires a visible, non-prerendered document.
- Records multi-signal WordPress Admin Bar evidence and blocks active or ambiguous evidence in Minimum Python Feed mode.
- Blocks iframe and Elementor editor-preview capture for Minimum Python Feed mode.
- Performs a bounded, versioned `HTMLImageElement.decode()` wait for images intersecting the current viewport and blocks unresolved viewport images.
- Keeps `document.hasFocus() === false` as warning-only.
- Records semantic dialog evidence without inferring a blocking overlay.
- Does not use Largest Contentful Paint as a readiness gate.
- Hides permissive runtime export actions from Minimum Python Feed sessions until readiness is `READY`.

## Verification state

Repository, schema, package, reproducibility, and dependency-audit results are recorded in `docs/release/test-results.md`. Browser runtime E2E remains `insufficient_evidence` in the current managed Chromium environment.
