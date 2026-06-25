# Diagnostics Boundary Review — 1.6.17

Version 1.6.17 adds an explicit non-sensitive `failure_boundary` field to diagnostics and validates it in `schemas/diagnostic.schema.json`.

## Boundary enum

- `REQUEST_CONSTRUCTION_FAILURE`
- `TRANSPORT_FAILURE`
- `LISTENER_FAILURE`
- `CONTENT_CAPTURE_FAILURE`
- `CHUNK_VALIDATION_FAILURE`
- `STORAGE_WRITE_FAILURE`
- `MIGRATION_STORAGE_READ_FAILURE`
- `EXPORT_PREFLIGHT_FAILURE`
- `PACKAGE_GENERATION_FAILURE`
- `BROWSER_QUALIFICATION_FAILURE`
- `SERVICE_WORKER_RESTART_RECOVERY_FAILURE`
- `RESTRICTED_PAGE_ACTIVE_TAB_SCRIPTING_INJECTION_FAILURE`
- `RESPONSE_ENVELOPE_VALIDATION_FAILURE`

## Privacy filter

Diagnostic context keys that indicate cookies, tokens, credentials, passwords, secrets, localStorage/sessionStorage, form values, DOM excerpts, or page text are rejected. URL-like context values have username, password, query strings, and fragments removed before export.

## Regression coverage

- `tests/unit/diagnostics.test.ts`
- `tests/unit/responseEnvelopeValidation.test.ts`
- `tests/unit/uiMessageProtocol.test.ts`
- `tests/integration/documentBindingAndRestrictedPages.test.ts`
