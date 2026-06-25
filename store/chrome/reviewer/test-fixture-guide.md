# Test fixture guide

Use a controlled local page or a public page that contains no confidential data. Recommended checks:

- A generic page with visible, hidden, fixed, sticky, absolute, clipped, and overflowing elements.
- A page containing existing Elementor V3 identifiers.
- A page containing Atomic V4 identifiers.
- A hybrid page containing both forms.
- A large page to observe bounded traversal diagnostics.

The extension captures only after explicit user action. Restricted browser pages such as `chrome://` pages are expected to produce a clear unsupported-page diagnostic.
