# Privacy model

The extension is local-only and user-triggered. It has no telemetry, analytics, remote API, automatic upload, persistent host permission, cookie access, history access, webRequest access, or native messaging.

## Default exclusions

- input/password/hidden/textarea/select values;
- href values and form actions;
- event handlers and accessible names by default;
- aria-controls values;
- full contenteditable content;
- URL credentials, query strings, and fragments;
- raw text previews and screenshots unless explicitly enabled.

## Bridge Context

Imports require explicit user action. Files are processed locally, never executed, bounded by bytes/depth/nodes/strings/documents/elements, checked for unsafe keys, validated against schema, and required to use canonical bytes.

## Pseudonymous evidence

Hashes of locators, source records, and DOM references are pseudonymous technical data, not anonymous data. Users should handle exported ZIPs as potentially sensitive local evidence.

## Browser 1.6.14 environment evidence

Capture environment warnings are factual booleans/counts only. They may reveal that a WordPress admin bar, editor preview, iframe, visible modal, active animation, non-top scroll position, or visible incomplete image existed. They do not collect account names, modal text, image URLs, or form values.

Strict path privacy withholds raw path facts but does not anonymize scheme, host, or port.
