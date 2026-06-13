# Privacy Model

The model is local-only and user-triggered. Strict mode keeps only identity tokens needed for matching and disables text previews. Standard mode allows bounded sanitized class tokens. Diagnostic mode allows additional sanitized metadata but still excludes form values, secrets, cookies, history, storage contents, URL queries, and URL fragments.

Screenshots and text previews are independent opt-ins. The review stage displays their state before export. Screenshot failure never invalidates JSON evidence. Large evidence is temporary by default and is cleared after export initiation unless retention is explicitly enabled.

Field-level inventory appears in `docs/data-dictionary.md`. Store-facing disclosure appears in `docs/store-privacy-disclosure.md`.
