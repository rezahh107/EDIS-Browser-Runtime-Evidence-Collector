# Privacy Policy

EDIS Browser Runtime Evidence Collector operates locally and only after explicit user action. It has no telemetry, analytics, advertising, tracking, remote API, automatic upload, browsing-history access, cookie access, or access to site storage.

The default capture records the normalized page origin and a pseudonymous normalized-locator hash, viewport and document dimensions, bounded element identity metadata, finite geometry, allowlisted computed-style strings, visibility, overflow and text-layout facts, and structured diagnostics. It does not record form values, password values, hidden input values, cookies, credentials, URL query strings, URL fragments, or full page text.

Raw normalized locator facts and paths, page titles, colors, screenshots, and bounded text previews are independent options. When raw path inclusion is disabled, raw locator facts are withheld and only a `sha256:` locator digest remains; this digest is pseudonymous and can still be privacy-sensitive. Hidden descendants are excluded by default even when hidden by an ancestor. Screenshots and text preview are disabled by default and require explicit opt-in. Screenshots may contain sensitive visible pixels. Text preview excludes form controls, is length-bounded, and applies secret-like value redaction, but users should still enable it only on pages they are authorized to inspect.

Preferences use extension-local storage. Session coordination uses extension session storage. Capture jobs, chunks, snapshots, sessions, and optional screenshots use extension-scoped IndexedDB. Large capture artifacts are deleted after export unless retention is enabled. The options page provides a clear-all-data action.

Exported packages are written locally and remain under the user's control.

Source editor labels may be included only when they are explicitly present in a user-imported, locally validated WordPress Bridge Context. The extension does not infer semantic labels such as “Hero” or “Pricing” from visual appearance.
