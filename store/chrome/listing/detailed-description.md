# EDIS Browser Runtime Evidence Collector

EDIS Browser Runtime Evidence Collector records bounded browser-rendering evidence from the active page after an explicit user action. It is designed for local, offline analysis by EDIS Python.

The extension can record viewport and document dimensions, bounded element geometry, stable identity metadata, allowlisted computed styles, visibility and overflow facts, diagnostics, and an optional screenshot of the currently visible viewport.

## Privacy and control

- Processing is local-only.
- No telemetry or analytics are included.
- No evidence is uploaded automatically.
- Cookies and browsing history are not read.
- Form values, password values, hidden input values, and authentication tokens are not collected.
- URL query strings and fragments are excluded by default.
- Screenshots are disabled by default and require explicit opt-in.
- Bounded text preview is disabled by default and requires explicit opt-in.
- The page is not modified and no persistent page observer is installed.

## Evidence, not judgment

The extension records factual runtime evidence. It does not score UX quality, issue accessibility verdicts, interpret design laws, recommend CSS values, or call AI services.

## Workflow

1. Open an ordinary HTTP or HTTPS page.
2. Invoke the extension from the toolbar.
3. Create or select a local capture session.
4. Capture the active viewport.
5. Review diagnostics and export a local ZIP package.

The exported package remains under the user's control and includes versioned JSON, schemas, checksums, and package metadata.
