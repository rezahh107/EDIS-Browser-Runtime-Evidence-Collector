# Runtime data dictionary

## Identity and binding

- `node_id`: package-local emitted-node identifier.
- `stable_dom_reference`: deterministic runtime DOM reference.
- `reference_sha256`: digest of the runtime reference.
- `evidence_lineage.snapshot_id`: snapshot identity for the observation; no independent `observation_id` is implied.
- `runtime_elementor_markers`: raw `data-elementor-id`, `data-id`, and class-marker facts.
- `source_binding`: preliminary evidence against imported WordPress indexes.
- `source_element_key`: WordPress-owned hash for one saved source record.

## Runtime instances and cardinality

- `runtime_instance`: conservative instance grouping based on validated direct or ancestor source markers.
- `instance_state`: factual grouping state; `REPEATED_TEMPLATE` requires explicit `loop-item` source-document evidence.
- `document_instances`: disconnected runtime roots grouped by bound source document when relationship evidence is available.
- `source_runtime_cardinality`: zero, one or multiple direct runtime candidates for imported source elements.
- `absence_reason_codes`: only evidence-grounded absence facts such as source document not present or runtime candidate not observed.

## Relationships

- `dom_parent_reference`: real DOM parent reference even when not emitted.
- `dom_parent_emitted`: whether the real parent is in the snapshot.
- `nearest_emitted_parent_node_id`: nearest emitted ancestor.
- positioned/scroll/clipping ancestor fields: bounded runtime ancestor facts.

## Text, interaction and styles

- `interaction_facts`: factual role/tag/tabindex/disabled/presence/style fields.
- `text_shape`: counts, line-box method/status, wrapping and clipping without raw text by default.
- `computed_style_origin`: availability statement only; current value is `RESOLVED_COMPUTED_VALUE_ONLY` and CSSOM origin inspection is not performed.

## Capture quality

- `capture_readiness`: bounded observations before collection, with all incomplete images separated from effectively visible incomplete images.
- `capture_state`: scroll, focus, document visibility, pointer/hover and animation/sticky facts at capture time.
- `capture_environment`: warning facts such as admin bar, editor preview, iframe, focus, scroll position, visible modal, animation and visible incomplete images.
- `capture_completeness`: traversal budgets, truncation and hidden-subtree pruning.
- `skipped_hidden_direct_child_count`: known lower bound of unvisited descendants; it is not claimed as the full hidden descendant count.
- `runtime_coverage`: module and observation availability.
- `source_binding_coverage`: preliminary binding counts.

## Metric scope

- `discovered_*`: elements actually visited by the bounded walker before pruning or limits.
- `emitted_*`: elements written to the snapshot.

Neither scope means every DOM node in an unvisited hidden or truncated subtree was measured.

## Privacy

No form values, href values, event handlers, cookies, history, query strings, or fragments are part of default evidence. Path hiding does not remove site origin evidence.
