# EDIS Runtime Collector 1.6.8 — Strict Message Payload Hotfix

```yaml
extension_version: 1.6.8
runtime_snapshot_schema: 1.5.0
runtime_package_manifest_schema: 1.4.1
observation_set_schema: 1.1.0
python_feed_readiness_schema: 1.0.0
release_type: hotfix
```

## Fixed

1. The popup now sends the required `requestedProfileId` with every `CAPTURE_START` request.
2. The popup exposes the same Desktop, Tablet, Mobile, and Custom provenance choices as the side panel.
3. UI and content-script message producers now use a strict versioned payload map, so missing required fields fail TypeScript validation.
4. Outbound extension messages are validated before `chrome.runtime.sendMessage`; malformed local payloads fail with a specific sender-side error instead of reaching the service worker.
5. Requested viewport profile validation is centralized and reused by message and capture-configuration validation.
6. Regression coverage verifies all four profiles, malformed-payload rejection, and both popup and side-panel producer paths.

## Contract status

No schema, evidence semantics, permission, or architectural boundary changed. Version 1.6.8 repairs producers so they comply with the already-required Browser 1.6.7 message contract.

## Runtime qualification

- Repository tests: 169/169 passed in 47 files.
- Unit: 99 passed.
- Security: 11 passed.
- Integration: 59 passed.
- Schema validation: 20 documents and 19 unique schema identifiers passed.
- Chrome and Edge package validation passed.
- External package validation: 4/4 passed.
- Reproducible build: 100 files and production ZIP bytes matched.
- Production dependency audit: 0 vulnerabilities.
- Browser E2E remains `insufficient_evidence` because managed Chromium policy blocks unpacked extension loading in this environment.
