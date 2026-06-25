# Browser 1.6.6 / Runtime Package 1.4.1 Contract Delta

```yaml
status: implemented
browser_collector: 1.6.6
runtime_snapshot_schema: 1.4.1
runtime_package_schema: 1.4.1
base_schema: 1.4.0
change_type: patch_additive_metric_with_required_invariant
```

## Added runtime evidence

`document_metrics.skipped_elementor_elements` is now required and records the bounded difference between Elementor-marked elements discovered during traversal and Elementor-marked elements emitted into the snapshot.

The required invariant is:

```text
discovered_elementor_elements
=
emitted_elementor_elements
+
skipped_elementor_elements
```

All three values must be non-negative safe integers, and emitted must not exceed discovered.

## Classification contract

Discovery and emission use the same observable runtime-marker classifier. A node is classified as Elementor-marked when it contains either:

- a bounded valid `data-elementor-id`; or
- a class token beginning with `elementor-` or `e-`.

A `data-id` value alone is not sufficient. Marker classification is runtime evidence only and does not establish source binding or saved Elementor ownership.

## Package integrity additions

External package validation now checks:

- unique, contiguous observation indexes beginning at zero;
- one-to-one agreement between observation-set records and runtime snapshot artifacts;
- absence of missing or orphan snapshot references;
- Elementor metric invariants in every runtime snapshot.

## Boundary preservation

No final source/runtime correlation, Variable/Class resolution, breakpoint interpretation, formula evaluation, UX scoring, or rule execution was added to Browser.
