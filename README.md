# EDIS Browser Runtime Evidence Collector

Version `1.6.16` is a local-only Manifest V3 runtime evidence collector for the EDIS deterministic pipeline.

It records bounded rendered-browser facts only after explicit user action and exports Runtime Snapshot Schema `1.6.0` and Runtime Package Manifest Schema `1.4.1`. It may optionally import the bounded `bridge/source-context.json` artifact produced by EDIS WordPress Evidence Exporter 3.2.0, enabling preliminary source-binding evidence without contacting WordPress.

## Architectural boundary

```text
WordPress 3.2.0  → saved source evidence, registries and provenance
Browser 1.6.16    → rendered runtime observations and preliminary source binding
Python           → package verification, final correlation, resolution, formulas and rules
LLM              → explanation and prioritization of deterministic Python output only
```

The extension does not score UX, evaluate policies, resolve Elementor Variables or Global Classes, assign breakpoint names, infer final source/runtime meaning, modify page source evidence, monitor pages persistently, or upload evidence.

## Main capabilities

- Runtime Snapshot Schema `1.6.0`, Observation Set Schema `1.1.0`, and Runtime Package Manifest Schema `1.4.1`.
- Dedicated Minimum Python Feed export with deterministic readiness evidence and embedded canonical WordPress Source Context.
- Hidden descendant subtrees are pruned when hidden-element collection is disabled, before they consume traversal depth or scan budget.
- Hidden-pruning evidence records skipped subtree count and the known direct-child lower bound without pretending the full omitted descendant count was measured.
- Capture readiness separates all incomplete images from incomplete images effectively visible in the viewport. Offscreen or effectively hidden images do not block stable readiness.
- Document metrics use one shared Elementor marker classifier and separate bounded discovered, emitted, and skipped counts with a fail-closed invariant.
- Manifest-derived version badges appear at the top of the popup and side panel.
- Capture-state and capture-environment facts record scroll, focus, visibility, pointer/hover capability, animation/sticky candidates, admin-toolbar/editor/iframe/modal warnings and incomplete visible images.
- Conservative runtime-instance evidence records single render, nested component, multiple runtime roots and repeated template states. `REPEATED_TEMPLATE` is emitted only when validated source evidence identifies a `loop-item` document.
- Preliminary source-to-runtime cardinality records zero, one or multiple direct runtime candidates without performing final correlation.
- Document-instance boundaries preserve separately rendered source documents such as page, header, footer, popup and loop-item documents when source context and relationship evidence support them.
- Computed-style origin availability explicitly states that only resolved computed values were observed; CSSOM origin resolution is not claimed.
- Diagnostics are stored once in `data.diagnostics`; the shared envelope diagnostics array is empty for the aggregate diagnostics artifact.
- `schema-index.json` is validated against a strict, closed schema.
- Local, explicit, schema-validated WordPress Bridge Context import.
- Raw Elementor marker facts remain separate from interpreted source binding.
- Preliminary binding states: `EXACT`, `PROBABLE`, `AMBIGUOUS`, `UNMATCHED`.
- Deterministic package layout, canonical JSON, SHA-256 inventory and exact artifact-by-artifact pre-export validation.

## Contract status

The frozen cross-product contract bundled in `docs/contracts/EDIS-Cross-Product-Contract-Freeze-v1.0.0.md` remains unchanged and describes Browser 1.5.0 / Runtime Package 1.3.0. Browser 1.6.0 introduced Runtime Package 1.4.0. Browser 1.6.6 introduced Runtime Snapshot `1.4.1`. Browser 1.6.7 advanced Runtime Snapshot to `1.5.0`, Observation Set to `1.1.0`, and added the versioned Python Feed Readiness artifact while leaving the Runtime Package Manifest at `1.4.1`. Browser 1.6.9 added a guided Minimum Python Feed capture guard. Browser 1.6.10 advances Runtime Snapshot to `1.6.0`, Python Feed Readiness to `1.1.0`, and Capture Session to `1.1.0` while leaving Runtime Package Manifest at `1.4.1`. It adds canonical-scroll, visibility/prerendering, multi-signal WordPress Admin Bar, iframe/editor-preview, and bounded viewport-image readiness guards. It does not infer breakpoints, normalize geometry, or use LCP as a capture gate. Python must use explicit versioned ingestion and must not synthesize missing fields for older packages. Browser 1.6.11 is a performance-only implementation release: it preserves those schemas and ownership boundaries while adding capture-scoped DOM caches, indexed source binding, bounded readiness sessions, off-main-thread export, lower-copy ZIP assembly, digest reuse, cursor-based storage maintenance, and adaptive status polling. Browser 1.6.12 fixes the export recovery path: a Minimum Python Feed session that is not ready may be exported one-way as ordinary Runtime Evidence without weakening the feed blockers or changing recorded facts. It also separates blocking requirements from non-blocking warnings and makes Runtime Evidence the default workflow. Browser 1.6.13 makes legacy `workflow_mode: null` sessions fail closed for Minimum Python Feed, keeps captured legacy sessions runtime-only, hardens fallback eligibility, and adds a targeted Chromium E2E smoke gate for Push and Pull Request workflows. See `docs/release/contract-delta-1.6.13.md`. Browser 1.6.14 is the performance-remediation release that preserves all evidence schemas and boundaries while bounding text traversal, indexing structural ordinals, accounting cumulative session resources, reducing ZIP/snapshot copies, batching IndexedDB reads, and making readiness/state transfer incremental. Browser 1.6.15 hardens browser-qualification provenance, canonical JSON failure bounds, legacy chunk integrity, and migration/recovery verification without changing evidence schemas or ownership boundaries. Browser 1.6.16 repairs clean-checkout release gating, pins workflow actions to immutable commit SHAs, and proves byte-identical source-to-shipped Chrome/Edge artifact provenance without changing runtime evidence contracts.

## Personal-use release profile

Version `1.6.16` is qualified primarily for the owner's private **Load Unpacked** workflow and prioritizes deterministic production of Python-ingestable evidence. Store submission checks remain available, but Store publication is not a release blocker. The release priority is deterministic capture, service-worker recovery, bounded storage and DOM work, privacy-safe export, and reproducible local packages.

Executed evidence for this release includes 218 repository tests, schema validation, package validation, reproducible builds, and dependency audits. Browser runtime E2E remains `insufficient_evidence` in this environment: managed Chromium policy blocks unpacked extensions, and downloading the Playwright Chromium runtime was unavailable. This is an environment qualification gap, not a passed runtime result. WordPress 7 visibility uses a controlled synthetic fixture; a real WordPress/Elementor compatibility matrix remains `insufficient_evidence`.

## Install without Node.js

Use the extracted Chrome or Edge build whose selected folder contains `manifest.json` directly at its root:

- Chrome: `dist/chrome`
- Edge: `dist/edge`

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select that folder.

## Basic workflow

1. Open a normal `http://` or `https://` page.
2. Open the side panel. **Runtime Evidence** is the safe default; choose **Minimum Python Feed** only when you intend to satisfy its stricter Source Context and multi-viewport requirements.
3. For a minimum feed, import and confirm the matching WordPress `bridge/source-context.json` before the first capture.
4. Follow the guided Desktop, Tablet, and Mobile steps. The UI shows the actual target-page viewport; duplicate measured widths, duplicate required profiles, changed page fingerprints, noncanonical scroll, hidden/prerendered pages, active or ambiguous WordPress Admin Bar evidence, iframe/editor preview context, and unresolved in-viewport images are blocked before a Minimum Python Feed job is created.
5. Choose Standard, Deep DOM, or bounded Custom coverage.
6. Review capture completeness, feed readiness, environment warnings, and diagnostics.
7. Export the Minimum Python Feed only when readiness is `READY`. If a Minimum session is not ready, the preflight keeps the feed blocked but offers a one-way **Export runtime evidence instead** action for the facts already captured.

## Canonical Minimum Python Feed guards

Minimum Python Feed mode is capture-quality only. It requires matching Source Context, unique `DESKTOP`, `TABLET`, and `MOBILE` requested profiles, three distinct measured CSS-pixel widths in any order, one page fingerprint, canonical scroll `(0,0)`, a visible non-prerendered document, no active or ambiguous WordPress Admin Bar evidence, no iframe/editor-preview capture, and no unresolved images intersecting the current viewport after a bounded, versioned decode wait. `document.hasFocus() === false` remains warning-only because interacting with the extension side panel can remove focus without invalidating page geometry. LCP is not used as a readiness gate.

## Canonicalization hardening

EDIS-CJ-1 rejects cycles, excessive depth, excessive visited-node counts, oversized collections, non-finite numbers, unsafe integers, unsupported types, dangerous keys, undefined values, and invalid Unicode with stable `TypeError` codes. Invalid input is never converted to a sentinel value.

## Runtime package layout

```text
package-manifest.json
checksums.sha256
README.txt
observation-set.json
context/runtime-context.json
context/source-context-reference.json             # optional
source-context/wordpress-source-context.json       # minimum Python feed only
coverage/runtime-coverage.json
coverage/evidence-coverage.json
coverage/source-binding-coverage.json
coverage/source-runtime-cardinality.json
structure/page-structure-summary.json
observations/observation-0001/snapshot.json
observations/observation-0001/screenshot.png      # optional
diagnostics/diagnostics.json
validation/package-validation.json
validation/python-feed-readiness.json
schemas/...
```

Optional files are emitted only when they contain real evidence.

## Privacy defaults

Screenshots and raw text previews are disabled by default. Raw locator path facts are disabled by default; only pseudonymous locator hashes remain for matching. Hidden descendants are excluded by default, including descendants hidden by an ancestor. Form values, password values, hidden-input values, textarea values, select values, href values, form actions, event handlers, full contenteditable content, cookies, history, queries, fragments, telemetry, analytics and remote uploads are not collected.

Strict path privacy does not anonymize the site origin. The package may still contain scheme, host and port evidence.

## Development

Node.js 20 or newer is required only for development:

```text
npm ci
npm run release:gate:no-browser
```

Browser commands:

```text
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:headed
npm run test:e2e:chrome
npm run test:e2e:edge
npm run test:e2e:debug
```

Official Playwright extension testing requires a browser build that permits unpacked extensions. Managed browser policies can make E2E unavailable even when Chromium itself is installed.

## WordPress 7 compatibility status

The collector has no direct PHP, REST, database, or WordPress-core dependency. Version 1.6.16 preserves controlled synthetic regression coverage for the documented WordPress 7 viewport-visibility classes and verifies that effectively hidden subtrees are pruned without consuming depth budget. This is `verified_by_synthetic_fixture`, not a claim that a real WordPress 7 site/export matrix has been completed. Real WordPress 7, Multisite, logged-in/logged-out, and Elementor combinations remain separate compatibility evidence.

See `HELP_FA.md`, `HELP.md`, `docs/determinism.md`, `docs/schema-reference.md`, `docs/release/1.6.16-release-notes.md`, and `shared-vectors/README.md`.
