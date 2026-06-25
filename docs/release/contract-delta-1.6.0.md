# Browser 1.6.0 Contract Delta

```text
status: implemented
scope: browser_runtime_collector_only
cross_product_contract_modified: false
runtime_snapshot_schema: 1.4.0
runtime_package_schema: 1.4.0
python_adapter_status: required_not_included
```

## Authority and scope

The bundled frozen cross-product contract remains authoritative for the coordinated WordPress 3.2.0 / Browser 1.5.0 / Runtime Package 1.3.0 baseline. It is not edited by this release.

Browser 1.6.0 adds evidence fields and one package artifact requested for the next Browser release. These changes are versioned as Runtime Snapshot/Package 1.4.0 and must not be silently merged into the 1.3.0 route.

## Added Browser evidence

- hidden subtree pruning counts;
- viewport-aware image readiness;
- discovered/traversed and emitted metric scopes;
- snapshot-based lineage naming;
- strict schema-index validation;
- single-location aggregate diagnostics;
- manifest-derived UI version badges;
- capture state and environment warnings;
- conservative runtime instances;
- preliminary source/runtime cardinality;
- document instance boundaries;
- computed-style origin availability only.

## Unchanged ownership

Browser does not resolve references, Variables, Global Classes or breakpoint names; infer Loop post/product identity; perform final correlation; evaluate formulas or rules; score UX; or modify WordPress source evidence.

## Coordinated release condition

A coordinated EDIS release may claim Browser 1.6.0 compatibility only after Python has:

1. an explicit Runtime Package 1.4.0 schema route;
2. deterministic validation fixtures for the new fields and artifact;
3. tests proving that Browser preliminary evidence cannot override Python correlation;
4. backward-compatibility tests for 1.3.0 packages.
