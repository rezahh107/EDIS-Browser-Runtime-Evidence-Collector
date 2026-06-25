# Known limitations

- Capture is limited to ordinary top-level HTTP and HTTPS documents.
- Iframe documents and shadow-root descendants are not traversed.
- Evidence is a one-time snapshot; later mutations are not monitored.
- Screenshot capture covers only the visible viewport and requires the tab to remain active on the same URL.
- Element traversal, depth, payload, and storage are bounded; large pages can produce explicit truncation diagnostics.
- Only allowlisted computed styles are included. Full stylesheet provenance and cascade reconstruction are outside scope.
- Visibility, overflow, wrapping, and clipping fields are raw facts, not accessibility or UX verdicts.
- Store approval, universal Elementor compatibility, and universal browser compatibility are not claimed.
