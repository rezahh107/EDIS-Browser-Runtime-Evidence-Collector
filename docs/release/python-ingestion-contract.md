# Python Ingestion Contract Delta for Browser 1.6.0

Status: `implemented_browser_delta_requires_python_adapter`

This document supplements but does not modify `EDIS-Cross-Product-Contract-Freeze-v1.0.0.md`. Python remains the only component that verifies and joins WordPress and Browser bundles, performs final correlation, resolves effective values, and executes formulas and rules.

## Required ingestion stages

1. Detect package family and schema version.
2. Verify ZIP safety, declared paths, file sizes, checksums and canonical JSON.
3. Route Browser Runtime Package `1.4.0` separately from `1.3.0` and older versions.
4. Validate shared envelopes by `schema_id` and `schema_version`.
5. Verify EDIS-CJ-1 and EDIS-URL-1 conformance against shared vectors.
6. Preserve source truth, runtime availability, browser binding state, validation state and job state independently.
7. Consume Browser source-binding, runtime-instance, document-instance and cardinality evidence as preliminary evidence only.
8. Preserve ambiguity, unmatched candidates and absence reason codes without coercing them to exact.
9. Build Python-owned final source/runtime correlation and coverage.
10. Resolve saved declarations, responsive inheritance, Variables, Global Classes and effective values only after provenance checks.
11. Use measured viewport facts; Browser labels do not establish Elementor breakpoint identity.
12. Determine rule readiness from source coverage, runtime coverage, source-binding coverage and formula-specific requirements.
13. Produce deterministic provenance for every resolved value, finding, metric and score.

## Runtime Package 1.4.0 additions

Python must validate and preserve:

- `capture_readiness.incomplete_image_count_total`;
- `capture_readiness.incomplete_image_count_in_viewport`;
- `capture_state`;
- `capture_environment`;
- hidden-subtree pruning counts;
- discovered/traversed and emitted metric scopes;
- per-element `runtime_instance` basis evidence;
- per-element `computed_style_origin` availability;
- snapshot-level `document_instances`;
- snapshot-level `source_runtime_cardinality`;
- `coverage/source-runtime-cardinality.json`;
- strict schema-index entries;
- aggregate diagnostics stored only in payload data.

## Interpretation constraints

- `REPEATED_TEMPLATE` is Browser evidence only when validated source context identifies a `loop-item` document. It is not proof of post/product identity.
- `MULTIPLE_RUNTIME_ROOTS` states repeated roots without assigning semantic cause.
- Cardinality records count direct validated-marker candidates; they are not final matches.
- `ZERO` cardinality is not automatically an error. Python may evaluate empty rendering, conditions or dynamic-template hypotheses only when supporting source evidence exists.
- `computed_style_origin.availability` does not identify a Variable, Global Class, stylesheet or selector as the origin.
- `skipped_hidden_direct_child_count` is a lower bound, not a complete omitted-node count.

## Legacy rules

- Missing 1.4.0 evidence remains absent in 1.3.0 packages.
- Python must not synthesize runtime instances, environment facts or cardinality records for legacy packages.
- Deprecated fields are interpreted only through explicit schema-version adapters.
