# Browser 1.6.12 Contract Delta

## Status

```yaml
status: no_evidence_contract_change
collector_version: 1.6.12
runtime_snapshot_schema: 1.6.0
capture_session_schema: 1.1.0
python_feed_readiness_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
```

## External evidence contract delta

`not_applicable`

Version 1.6.12 does not change evidence schemas, canonical JSON, SHA-256 inventory, package paths, Source Context semantics, or cross-product ownership boundaries.

## UI and application policy delta

A versioned application policy now permits this one-way compatibility relation:

```text
MINIMUM_PYTHON_FEED session -> RUNTIME_EVIDENCE export: allowed
MINIMUM_PYTHON_FEED session -> MINIMUM_PYTHON_FEED export: readiness-gated
RUNTIME_EVIDENCE session -> RUNTIME_EVIDENCE export: allowed
RUNTIME_EVIDENCE session -> MINIMUM_PYTHON_FEED export: forbidden
```

The downgrade does not alter `workflow_mode`, readiness state, snapshots, diagnostics, or Source Context facts. It changes only the requested package purpose.

## UI clarification

Preflight blockers and warnings are rendered separately. A runtime fallback is displayed only when the ordinary runtime export path has no independent blocker such as zero observations, active capture, failed session, or incompatible workflow direction.
