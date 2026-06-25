# Browser 1.6.11 Contract Delta

## Status

```yaml
status: no_external_contract_change
collector_version: 1.6.11
runtime_snapshot_schema: 1.6.0
capture_session_schema: 1.1.0
python_feed_readiness_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
```

## External contract delta

`not_applicable`

Version 1.6.11 changes execution strategy only. Canonical JSON, SHA-256 inventory, evidence fields, package paths, message payload validation, permissions, Source Context semantics, and Python-owned computation boundaries remain unchanged.

## Internal implementation changes

- Capture-local WeakMap caches and immutable indexes.
- Mutation-scoped image readiness observer.
- Internal dedicated export worker.
- Direct ZIP32 buffer writer and table-driven CRC32.
- Cursor-based maintenance and adaptive UI polling.

These mechanisms must not be interpreted as new evidence, resolution, inference, or deterministic Python output.
