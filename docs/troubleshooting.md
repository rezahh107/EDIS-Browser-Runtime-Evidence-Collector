# Troubleshooting

## Page is unsupported

Use a normal HTTP or HTTPS page. Browser internals, extension pages, store pages, local files without explicit browser access, and privileged pages are rejected.

## Capture stopped at a limit

Review diagnostics. Increase element, depth, or snapshot-size budgets conservatively in options, then capture again.

## Screenshot failed

JSON evidence remains available. Keep the target tab active, avoid navigation during capture, and retry after an explicit invocation.

## Worker interruption

Reopen the panel. Persisted job state is recovered or marked with an explicit interruption diagnostic. A partial package is never presented as complete.

## Export is large

Disable screenshots, text previews, hidden elements, and optional colors, or lower the element budget.
