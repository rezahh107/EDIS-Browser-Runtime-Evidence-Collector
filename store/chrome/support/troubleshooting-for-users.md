# Troubleshooting for users

## The extension cannot capture the page

Confirm the page uses HTTP or HTTPS and is the active tab. Browser settings pages, browser stores, extension pages, PDF viewers, and other protected pages cannot be injected into.

## Capture was interrupted

Keep the tab open and avoid navigation or reload until capture and optional screenshot handling finish. Reopen the side panel to inspect the terminal diagnostic and start a new capture when needed.

## A large page was truncated

The collector enforces element, traversal-depth, payload, and storage limits. A diagnostic records the limit. This is expected safety behavior rather than silent completion.

## Screenshot was not created

Screenshots are disabled by default. Enable the option only after reviewing the warning, keep the captured tab active, and retry. JSON evidence should remain available when screenshot capture alone fails.

## Export is unavailable

Confirm the session contains at least one complete snapshot and no incomplete job is being treated as complete. Try reopening the side panel. Use Options to clear extension-owned data only after preserving any needed export.

## Reporting an issue

Use `SUPPORT_PUBLIC_URL_REQUIRED` and remove sensitive data before attaching logs or evidence.
