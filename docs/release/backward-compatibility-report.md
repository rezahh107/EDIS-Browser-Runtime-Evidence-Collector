# Backward Compatibility Report — Browser 1.6.4

## Version routes

- `CURRENT_VALID_1_6`: Runtime Package `1.4.0` satisfies all 1.4.0 schemas and invariants.
- `COORDINATED_VALID_1_5`: Browser 1.5.0 / Runtime Package `1.3.0` remains readable through an explicit 1.3.0 route.
- `LEGACY_VALID`: an older package satisfies its own explicitly supported schema route.
- `INVALID`: package fails safety, integrity, canonicalization, checksum, referential integrity or applicable schema validation.

These labels are ingestion guidance for Python; Browser does not perform historical analytical migration.

## Preserved behavior

- Existing 1.3.0 evidence remains evidence of what was actually captured.
- Old packages are not rewritten to resemble 1.4.0 packages.
- Raw runtime markers remain separate from preliminary binding evidence.
- Final correlation, formula evaluation and rule execution remain Python-owned.

## 1.4.0 evidence that cannot be reconstructed

The following fields remain absent for old packages unless they were originally captured:

- hidden subtree pruning counts;
- total versus in-viewport incomplete image counts;
- discovered/traversed versus emitted metric scopes;
- capture-state and capture-environment facts;
- runtime-instance grouping;
- document-instance boundaries;
- source-to-runtime cardinality records;
- computed-style origin availability declaration;
- dedicated source-runtime-cardinality artifact;
- single-location aggregate diagnostics invariant.

Null placeholders must not be added in a way that implies collection occurred.

## Breaking surface

Runtime Snapshot/Package Schema advanced from `1.3.0` to `1.4.0`. A Python implementation that accepts only `1.3.0` must reject or explicitly classify the new package until a validated 1.4.0 adapter is added.

## Ownership

Python owns historical ZIP ingestion and analytical migration. Browser 1.6.4 may preserve its own locally stored evidence but must not fabricate fields from a newer schema.
