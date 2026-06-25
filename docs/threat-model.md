# STRIDE Threat Model

## Spoofing

Messages are checked for protocol version, UUID request correlation, exact envelope keys, payload shape, sender extension ID, extension-page origin, content-script tab binding, HTTP(S) URL, active job, and captured URL.

## Tampering

Canonical serialization rejects non-finite numbers and prototype-sensitive keys. Snapshot validation checks schema, IDs, element order, style allowlists, and budgets. ZIP entries use safe relative paths, CRC-32, deterministic ordering, and SHA-256 records.

## Repudiation

Persisted job transitions and stable diagnostic codes record cancellation, navigation, interruption, quota, validation, screenshot, and size outcomes without logging page content.

## Information disclosure

The extension has no network client, persistent host permission, telemetry, cookies, history, site-storage access, or text/form-value collection. Screenshots are explicit opt-in and size bounded.

## Denial of service

DOM depth, scanned nodes, collected elements, serialized bytes, screenshot bytes, message chunks, and stale-job age are bounded. Conflicting duplicate chunks are rejected.

## Elevation of privilege

There is no remote code, `eval`, `new Function`, inline script, native messaging, debugger permission, web-request permission, or broad wildcard host permission.
