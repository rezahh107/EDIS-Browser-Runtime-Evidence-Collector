# STRIDE Threat Model

## Spoofing

Forged runtime messages are rejected through protocol, request, message-type, sender-ID, extension-origin, tab-ID, and active-job checks.

## Tampering

Canonical serialization, finite-number checks, safe object keys, artifact validation, independent SHA-256 checksums, and safe ZIP paths detect or prevent corruption.

## Repudiation

Stable diagnostic codes and persisted job transitions record explicit outcomes without logging sensitive page content.

## Information disclosure

Minimal permissions, no persistent host access, strict redaction, disabled-by-default screenshots and text previews, no form values, and local-only storage reduce exposure.

## Denial of service

DOM depth, scanned nodes, collected elements, text preview, serialized size, message chunk, and time budgets are bounded. Navigation and cancellation stop work.

## Elevation of privilege

There is no remote code, dynamic evaluation, broad wildcard host permission, arbitrary fetch destination, native messaging, cookie access, or developer-protocol permission. Content code runs only after a user gesture on a validated page.
