# Schema reference

Collector package version: `1.6.16`  
Runtime Snapshot Schema: `1.6.0`  
Python Feed Readiness Schema: `1.1.0`  
Capture Session Schema: `1.1.0`  
Runtime Package Manifest Schema: `1.4.1`  
Shared Envelope Schema: `1.0.0`

## Shared envelope

Every shared JSON artifact contains `schema_id`, `schema_version`, `artifact_type`, producer, capture time, canonicalization profile, typed data, and scoped diagnostics. No generic status field exists.

The aggregate diagnostics artifact stores diagnostics only in `data.diagnostics`; its envelope-level `diagnostics` array is constrained to be empty.

## Main artifacts

- `observation-set.json` — ordered observations and operational IDs.
- `context/runtime-context.json` — runtime environment and per-observation capture configuration.
- `context/source-context-reference.json` — optional hash/reference to imported WordPress context.
- `coverage/runtime-coverage.json` — runtime evidence availability and bounded traversal coverage.
- `coverage/evidence-coverage.json` — explicit availability states for runtime, source context, preliminary binding, responsive comparison, and visual evidence.
- `coverage/source-binding-coverage.json` — preliminary page/element binding coverage.
- `coverage/source-runtime-cardinality.json` — per-observation zero/one/many direct source-to-runtime candidates.
- `structure/page-structure-summary.json` — factual regions, document instances and structure counts.
- `observations/.../snapshot.json` — geometry, styles, raw markers, bindings, relationships, readiness, state/environment facts, instances and completeness.
- `diagnostics/diagnostics.json` — aggregate diagnostics with canonical schema ID `urn:edis:schema:browser:diagnostics-artifact`.
- `validation/package-validation.json` — package self-validation evidence.
- `package-manifest.json` and `checksums.sha256` — exact file inventory and integrity.

## State dimensions

- Runtime availability: `AVAILABLE`, `PARTIAL`, `INSUFFICIENT`, `DISABLED`, `UNAVAILABLE`, `NOT_APPLICABLE`, `ERROR`.
- Browser binding: `EXACT`, `PROBABLE`, `AMBIGUOUS`, `UNMATCHED`.
- Validation: `PASS`, `FAIL`, `NOT_RUN`.
- User confirmation: `NOT_CONFIRMED`, `CONFIRMED`.
- Runtime instance: `SINGLE_RENDER`, `REPEATED_TEMPLATE`, `NESTED_COMPONENT`, `MULTIPLE_RUNTIME_ROOTS`, `UNKNOWN`.
- Cardinality: `ZERO`, `ONE`, `ONE_TO_MANY`.

Final correlation state is not a Browser artifact.

## Runtime Package 1.4.0 additions

- `capture_readiness.incomplete_image_count_total` and `incomplete_image_count_in_viewport`.
- `capture_state` and `capture_environment`.
- `capture_completeness.skipped_hidden_subtree_count` and known direct-child lower-bound count.
- discovered/traversed versus emitted metrics for Elementor, interactive, fixed and sticky candidates.
- per-element `runtime_instance` and conservative basis evidence.
- per-element `computed_style_origin` availability only; no CSSOM origin resolution.
- snapshot-level `document_instances` and `source_runtime_cardinality`.
- dedicated `coverage/source-runtime-cardinality.json` artifact.
- strict closed validation for `schema-index.json`.
- `evidence_lineage.snapshot_id` replaces the misleading `observation_id` name.

These additions are factual runtime evidence. They do not transfer final correlation, breakpoint resolution, registry resolution, formula evaluation or UX analysis into the Browser layer.

## Runtime Package 1.4.1 patch

- `document_metrics.skipped_elementor_elements` is required.
- `discovered_elementor_elements = emitted_elementor_elements + skipped_elementor_elements`.
- All three metric values are non-negative safe integers.
- Discovery and emission use the same observable runtime-marker classifier.
- The external package validator verifies unique contiguous observations and one-to-one Observation Set/Snapshot references.

Elementor marker classification is runtime evidence only. It does not establish saved-source identity or final source binding.

## Canonical Minimum Python Feed schema baseline retained since 1.6.14

- Observation Set Schema `1.1.0` requires `requested_profile_id`.
- Runtime Snapshot Schema `1.6.0` requires `viewport.requested_profile_id`.
- Python Feed Readiness Schema `1.0.0` reports deterministic availability and consistency only.
- Ready minimum feeds embed the unchanged WordPress Bridge Context under `source-context/`.
