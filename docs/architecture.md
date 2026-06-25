# Architecture — Browser Runtime Collector 1.6.14

## Product boundary

```text
Presentation: popup, side panel, options, guide
Application: capture/session/export/message use cases
Domain: runtime models, envelopes, canonicalization, URL normalization, validation
Infrastructure: Chrome adapters, IndexedDB, screenshots, package builder, ZIP/download
```

Domain code does not call browser APIs. The service worker never accesses the page DOM. Content collection is injected only after explicit user action and does not install persistent observers.

## Cross-product boundary

- WordPress 3.2.0 owns saved Elementor/WordPress source evidence and source truth.
- Browser 1.6.14 owns rendered observations, runtime availability, and preliminary source binding.
- Python owns package verification, final correlation, effective values, formulas, rules, findings, and scores.
- LLM owns explanation and prioritization only.

## Bridge Context

The optional `bridge/source-context.json` file is explicitly imported by the user, parsed locally, bounded, schema-validated, canonical-byte checked, and stored in IndexedDB. Browser copies operational analysis identifiers only from a valid import. Browser never contacts WordPress.

## Capture flow

```text
Explicit user action
  → persist deterministic job and session state
  → inject bounded collector into active tab
  → bounded readiness observations
  → bounded deterministic DOM traversal
  → chunk canonical snapshot payload
  → revalidate chunks and complete snapshot
  → atomically persist snapshot/session/job
  → pre-export package self-validation
  → deterministic ZIP download
```

## Evidence separation

Raw Elementor markers are always preserved separately from interpreted source-binding evidence. User confirmation is provenance only. Final correlation remains Python-owned.
