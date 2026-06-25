# Field-Level Privacy Inventory

Required fields include schema metadata, timestamps, collector identity, actual viewport dimensions, document dimensions, bounded element identities, finite geometry, raw allowlisted styles, visibility evidence, overflow evidence, capture state/environment facts, privacy flags, and diagnostics.

Optional fields include normalized path, page title, color styles, emitted hidden-element evidence, screenshot bytes, WordPress bundle reference, document reference, source/runtime cardinality evidence, and source-bound runtime/document instance evidence.

Forbidden fields include page text, cookies, site-storage contents, URL query and fragment, credentials, form values, hidden input values, password values, authentication tokens, payment values, private messages, browsing history, clipboard data, and keystrokes.

Origin evidence may remain present when raw path disclosure is disabled. Environment warnings never include user names, modal text, image URLs, or form values.
