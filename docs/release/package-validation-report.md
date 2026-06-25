# Package Validation Report — Browser 1.6.4

## Validated production targets

- Chrome Manifest V3 package.
- Edge Manifest V3 package.

## Package invariants

- `manifest.json` is present at the archive root.
- All manifest-referenced files exist.
- Permissions remain `activeTab`, `scripting`, `storage`, and `sidePanel`.
- CSP remains `script-src 'self'; object-src 'none'; base-uri 'none'`.
- No host permissions or persistent content scripts are declared.
- Production packages contain no source maps, test-only hooks, remote assets, external scripts, external stylesheets, or runtime development dependencies.
- Chrome and Edge share the same runtime implementation outside their manifests.
- Runtime Snapshot and Runtime Package schemas remain `1.4.0`.

## Hardening validation

- strict RFC 3339 validation passed;
- JSON Schema `uniqueItems` validation passed;
- Bridge document/element relationship-integrity validation passed;
- ZIP entry traversal, dot-segment, control-character, backslash, duplicate, and UTF-8 length rejection passed;
- synthetic WordPress 7 viewport-hidden subtree pruning passed in integration tests.

## Result

Source security scan, both target validations, cross-target comparison, schema validation, self-validation tests, deterministic ZIP tests, reproducibility, Store documentation validation, and production dependency audit passed in the recorded environment.
