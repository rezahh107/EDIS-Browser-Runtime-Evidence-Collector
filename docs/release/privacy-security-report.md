# Privacy and Security Report — Browser 1.6.4

## Preserved product boundaries

- Local-only operation.
- No telemetry, analytics, remote API, AI service, or automatic upload.
- Explicit user action is required for capture and Bridge Context import.
- No persistent page monitoring.
- No page DOM mutation.
- No cookie, history, debugger, webRequest, or nativeMessaging permission.
- Screenshot and raw text preview remain optional and disabled by default.

## Bridge Context safeguards

- Strict bundled-schema validation.
- Canonical JSON byte validation.
- Bounded file size, nesting depth, object/array node count, key length, string length, document count, and element count.
- Rejection of `__proto__`, `prototype`, and `constructor` keys.
- Imported content is parsed as data only and is never executed.
- No request is made to the WordPress site.
- Exact imported artifact SHA-256 is recorded.
- Duplicate document IDs, mismatched element/document ownership, duplicate source element keys, and absent explicit selections are rejected.

## Runtime privacy safeguards

- Raw form values, password values, hidden input values, textarea values, form actions, event handlers, href values, accessible names, and aria-controls values are not exported.
- Text shape stores counts and rendering facts, not raw text.
- Password controls, hidden inputs, form-control values, textarea values, contenteditable content, and script/style/template content are excluded from text measurement.
- Text preview remains separately controlled, bounded, redacted, and disabled by default.
- URL query strings and fragments are excluded by EDIS-URL-1. When raw path inclusion is disabled, raw `locator_facts` are also withheld and only a pseudonymous locator hash remains.
- Credential-like, token-like, nonce-like, email-like, and oversized locator segments are deterministically rejected or redacted.

## Package safeguards

- Stable relative paths only.
- Duplicate, absolute, backslash, null-byte, dot-segment, traversal, control-character, and overlong UTF-8 paths are rejected.
- File count and byte budgets are enforced.
- Canonical JSON, SHA-256, schema, referential-integrity, and declared-file validation run before export.
- Optional artifacts are absent rather than emitted as empty placeholders.
- Hidden-element filtering prunes effectively hidden descendant subtrees before they consume traversal depth or scan budget.
- Source editor labels are accepted only from locally imported schema-validated source evidence; visual section meanings are never inferred.
- Capture-environment warnings store bounded facts only and do not extract admin-bar text, modal text, image URLs, or user identity.

## Static validation status

TypeScript, lint, security/unit/integration tests, schema validation, production package scans, permission/CSP checks, deterministic ZIP tests, and dependency audit passed in the recorded validation environment.

## Runtime limitation

Real browser E2E did not execute in the available container because the managed Chromium policy `ExtensionInstallBlocklist = ["*"]` disables unpacked extensions. Chromium 144.0.7559.96 was present and identified successfully, but no Playwright test body ran. Runtime privacy, UI workflow, service-worker lifecycle, screenshot, and network-isolation behavior therefore remain unverified in that environment.
