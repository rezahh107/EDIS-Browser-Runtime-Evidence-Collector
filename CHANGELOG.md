# Changelog

## [1.6.16] - 2026-06-25

### Release integrity and clean-gate repair

- Made the release gate delete stale gate evidence and execute repository-test preparation, the real Vitest run, and report verification as separate mandatory steps.
- Added deterministic source ZIP packaging and a source-to-shipped artifact provenance gate that rebuilds Chrome and Edge from the packaged source and requires byte-identical ZIPs.
- Pinned every GitHub Actions dependency to a full 40-character commit SHA and added a workflow policy validator plus Dependabot maintenance configuration.
- Regenerated final Chrome and Edge packages from the same final source state used for the source ZIP and release reports.
- Corrected current-version and schema-reference documentation while preserving the unchanged Runtime Snapshot and Package Manifest schema versions.
- Preserved permissions, public evidence schemas, package layout, and Browser/Python ownership boundaries.

### Verification

- Clean no-browser release gate is required to start from an absent `artifacts/release-gate` directory.
- Browser runtime qualification remains `insufficient_evidence` until executed in an environment that permits unpacked extensions.

## [1.6.15] - 2026-06-25

### Browser qualification and deterministic guards

- Removed the hard-coded Chromium executable from browser qualification aggregation and bound every PASS result to recorded executable, browser-family, version, build, manifest, extension-ID, service-worker, platform, and report provenance.
- Added fail-closed qualification scopes that distinguish automated Playwright Chromium from exact Google Chrome and exact Microsoft Edge evidence.
- Added deterministic canonical JSON guards for cycles, maximum depth, maximum visited nodes, and maximum collection size with stable `TypeError` codes; malformed values are never converted to sentinel strings.
- Replaced newly written zero-hash chunks with real SHA-256 values and made legacy missing/zero-hash chunks an explicit compatibility state accepted only after full-snapshot checksum verification.
- Added v3-to-v4 IndexedDB migration coverage, legacy chunk recovery coverage, qualification-aggregator regressions, and canonical guard boundary tests.
- Made repository test execution single-worker and non-detached for stable release evidence in constrained environments.

### Qualification status

- The existing service-worker termination/recovery E2E tests remain the normative runtime tests; no duplicate substitute was added.
- Browser runtime evidence remains `insufficient_evidence` in this environment because managed Chromium policy blocks unpacked extensions and the Playwright Chromium download endpoint was unavailable. No blocked execution is represented as passed.

### Compatibility

- Preserved Runtime Snapshot `1.6.0`, Observation Set `1.1.0`, Capture Session `1.1.0`, Runtime Package Manifest `1.4.1`, permissions, package paths, and cross-product ownership boundaries.

## [1.6.14] - 2026-06-24

### Performance remediation and bounded resource accounting

- Bounded text-shape discovery to selected evidence subtrees with deterministic global node, character, and ancestor-step budgets.
- Added capture-scoped sibling and nth-of-type indexes to remove quadratic identity work.
- Added cumulative per-session snapshot and screenshot accounting with fail-fast capture and export capacity checks.
- Reduced snapshot assembly passes, screenshot/hash copies, ZIP parser copies, package lookup scans, and repeated diagnostic canonicalization.
- Added indexed bulk screenshot retrieval and rate-limited storage maintenance outside the capture hot path.
- Made viewport-image readiness mutation-aware and changed UI state transfer to lightweight session summaries plus the selected session.
- Added IndexedDB v4 indexes and automatic metadata migration/rebuild without changing evidence schemas or public package paths.
- Added targeted unit and integration regressions for all remediated audit paths.

### Compatibility

- Preserved Runtime Snapshot `1.6.0`, Capture Session `1.1.0`, Runtime Package Manifest `1.4.1`, permissions, canonical JSON, and cross-product ownership boundaries.
- Browser runtime E2E remains a separately reported qualification gate and is never inferred from repository tests.

## [1.6.13] - 2026-06-24

### Export provenance and CI hardening

- Made legacy `workflow_mode: null` sessions fail closed for Minimum Python Feed export while preserving ordinary Runtime Evidence export.
- Treated legacy null-mode sessions with existing captures as runtime-only and locked the workflow selector accordingly.
- Restricted the runtime-evidence fallback to explicitly recorded `MINIMUM_PYTHON_FEED` sessions.
- Added unit and integration regressions for null-mode policy, fallback eligibility, preflight behavior, package construction, and capture workflow resolution.
- Added a Chromium export-fallback smoke test to Push and Pull Request CI while retaining the full scheduled browser suite.
- Added target/grep forwarding to the E2E runner without bypassing its environment preflight.
- Corrected stale README performance-release wording and repository test counts.
- Updated the transitive development dependency `undici` to 7.28.0; full and production dependency audits report zero vulnerabilities.
- Preserved all evidence schemas, package paths, browser permissions, canonicalization rules, and cross-product ownership boundaries.

## [1.6.12] - 2026-06-19

### Export recovery and diagnostic clarity

- Added a one-way, fail-closed export policy that permits `MINIMUM_PYTHON_FEED` sessions to produce ordinary Runtime Evidence while continuing to forbid Runtime sessions from producing Minimum Python Feed packages.
- Preserved every Minimum Python Feed readiness blocker and did not change evidence facts, schemas, package paths, or Python-owned analysis boundaries.
- Separated blocking requirements from non-blocking coverage warnings in the export preflight.
- Added an explicit **Export runtime evidence instead** action only when ordinary runtime export is itself valid.
- Made Runtime Evidence the default workflow for new sessions to reduce accidental entry into the strict feed workflow.
- Added unit, integration, and browser E2E regression coverage for the workflow/purpose matrix and fallback dialog.

## [1.6.11] - 2026-06-19

### Performance and scalability

- Added capture-scoped style, geometry, visibility, ancestor, identity, and reference caches without changing emitted evidence contracts.
- Replaced repeated source-binding and runtime-marker scans with immutable per-capture indexes.
- Reused text-node and line-box evidence and module-scoped segmenters.
- Added mutation-aware viewport-image readiness sessions with one-time decode tasks and deterministic cleanup.
- Reduced snapshot chunk retention and preallocated final assembly while preserving the existing string transport contract.
- Replaced bitwise CRC and repeated ZIP concatenation with table-driven CRC32 and one preallocated ZIP32 buffer.
- Moved package build, validation, hashing, and ZIP creation to a dedicated extension worker.
- Reused validated digests, cached schema patterns, and replaced quadratic `uniqueItems` checks with stable structural keys.
- Replaced full IndexedDB chunk materialization during maintenance with cursor-based aggregation and cleanup.
- Added aggregate-backed status checks and bounded adaptive polling in popup and side panel.

### Verification

- Added a capture-cache regression test and aggregate metadata assertions.
- Repository tests: 183 passed in 51 files; 0 failed, skipped, pending, or todo.
- No evidence schema, browser permission, public message contract, or cross-product ownership boundary changed.
- Browser runtime E2E remains `insufficient_evidence` until executed in an environment that permits unpacked extensions.

## [1.6.10] - 2026-06-18

### Canonical Python Feed capture quality

- Locked the selected capture workflow after the first observation.
- Preserved free capture order while requiring unique `DESKTOP`, `TABLET`, and `MOBILE` requested profiles plus three distinct measured CSS-pixel widths.
- Added canonical-scroll, visible/non-prerendered page, iframe/editor-preview, and multi-signal WordPress Admin Bar guards for Minimum Python Feed capture.
- Added bounded, versioned viewport-image readiness using `HTMLImageElement.decode()` without using LCP as a capture gate.
- Kept `document.hasFocus() === false` as warning-only and recorded semantic dialog evidence without inferring a blocking overlay.
- Advanced Runtime Snapshot Schema to `1.6.0`, Python Feed Readiness Schema to `1.1.0`, and Capture Session Schema to `1.1.0`; Runtime Package Manifest remains `1.4.1`.
- Added no browser permission and no Browser-owned breakpoint inference, normalization, correlation, formulas, rules, or UX analysis.

### Verification

- Repository tests: 182 passed in 50 files.
- Schema validation: 20 documents, 19 unique identifiers, exact index coverage.
- Independent package validation: 4/4 passed.
- Reproducible build: 100 files, zero mismatches.
- Production dependency audit: zero vulnerabilities.
- Browser runtime E2E remains `insufficient_evidence` in the managed-policy environment.

## [1.6.9] - 2026-06-18

### Guided Minimum Python Feed capture

- Added explicit Runtime Evidence and Minimum Python Feed capture modes.
- Added a deterministic target-page probe for actual viewport dimensions and page fingerprint evidence.
- Required confirmed matching Source Context before a Minimum Python Feed job is created.
- Blocked duplicate required profiles, duplicate measured viewport widths, changed page fingerprints, and incompatible source references before capture.
- Rechecked approved viewport width and page fingerprint during finalization.
- Added a guided Source/Desktop/Tablet/Mobile/export workflow while preserving permissive ordinary Runtime Evidence capture.
- Added compile-time, unit, and integration regressions for the capture guard and shared page fingerprint.

### Verification

- Repository tests: 176 passed.
- No evidence schema, permission, or cross-product ownership boundary changed.
- Browser runtime E2E remains `insufficient_evidence` until executed in an unpacked-extension-capable environment.

## [1.6.8] - 2026-06-17

### Fixed

- Fixed the popup `CAPTURE_START` producer so it always sends the required `requestedProfileId`.
- Added a localized Desktop/Tablet/Mobile/Custom profile selector to the popup.
- Added strict typed payload maps for extension UI and content-script message producers.
- Added sender-side payload validation before `chrome.runtime.sendMessage`.
- Centralized requested viewport profile validation across capture configuration and message validation.
- Added compile-time and runtime regression tests covering malformed capture payloads and all supported profiles.

## [1.6.7] - 2026-06-17

### Minimum Python Feed workflow

- Added requested viewport profile provenance separately from measured viewport dimensions.
- Added deterministic Python Feed readiness validation and a dedicated minimum-feed export path.
- Embedded the exact canonical WordPress Source Context only in ready minimum-feed packages.
- Required confirmed Source Context, three observations, three distinct measured widths, Desktop/Tablet/Mobile profiles, one page fingerprint, consistent source references, and contiguous indexes.
- Added independent cross-artifact validation for feed readiness and source-context hashing.
- Preserved ordinary runtime-only export for incomplete evidence.
- Automatically synchronizes newly imported Source Context to the selected session only while the session is empty.
- Advanced Runtime Snapshot Schema to `1.5.0` and Observation Set Schema to `1.1.0`; Runtime Package Manifest remains `1.4.1`.

### Verification

- Repository tests: 162 passed.
- Schema validation: 20 documents, 19 unique identifiers, exact index coverage.
- Browser runtime E2E remains `insufficient_evidence` in the managed-policy environment.

## [1.6.6] - 2026-06-17

### Metric consistency and package qualification

- Added one shared observable Elementor marker classifier for bounded discovery and emitted-element metrics.
- Added required `skipped_elementor_elements` evidence and the invariant `discovered = emitted + skipped`.
- Added fail-closed validation for contradictory Elementor metrics.
- Strengthened internal and external package validation for duplicate/non-contiguous observations and missing/orphan snapshot references.
- Advanced Runtime Snapshot and Runtime Package schemas to patch version `1.4.1`.
- Added regression coverage without adding browser permissions or moving final correlation, resolution, formulas, rules, or UX analysis into Browser.

### Verification

- Repository tests: 157 passed.
- Browser runtime E2E remains `insufficient_evidence` in the available managed-policy environment.

## [1.6.4] - 2026-06-15

### Personal reliability and performance hardening

- Made finalization ownership atomic with the persisted job transition and required the same live claim owner for the final commit.
- Added renewable finalization leases so long captures do not become eligible for a second finalizer while screenshot or package work is still active.
- Prevented stale finalizers from terminating or overwriting a job after another worker has taken ownership.
- Replaced per-chunk full-buffer rescans with transactionally maintained chunk count and byte aggregates.
- Added startup maintenance for expired claims, orphaned chunks, missing chunk aggregates, and old terminal job records while preserving sessions, snapshots, screenshots, preferences, Source Context and monotonic identity sequences.
- Serialized concurrent recovery calls through one in-flight recovery operation.
- Replaced the multi-process repository test runner with one isolated Vitest invocation and deterministic unit/security/integration report partitioning.

### Verification

- Added regressions for lease renewal, stale-owner commit rejection, 100-chunk aggregation, orphan cleanup, aggregate rebuilding and terminal-job pruning.
- Kept Runtime Snapshot and Runtime Package schemas at `1.4.0`.
- Added no browser permission, host permission, exported artifact, WordPress network request, final correlation or Python-owned rule behavior.
- The release is optimized for trusted personal Load Unpacked use; Store publication is not a release objective.

## [1.6.2] - 2026-06-15

### Qualification fixes

- Prevented sensitive textarea, form-control and editable descendant text from reappearing through an ancestor text preview.
- Added an IndexedDB finalization claim and protected completed jobs from stale interruption writes.
- Preserved monotonic internal identity sequences when clearing user evidence.
- Hardened the real-browser harness to invoke the extension action before exercising popup workflows and kept the production `activeTab` permission model unchanged.
- Aligned browser package tests with Runtime Package Schema `1.4.0` field names and `sha256:` digest formatting.

## [1.6.1] - 2026-06-15

### Hardened

- Enforced strict RFC 3339 date-time validation in the embedded schema validator instead of accepting date-only or impossible timestamps through permissive platform parsing.
- Enforced JSON Schema `uniqueItems` for primitive and structured array members.
- Added Bridge Context relationship-integrity checks for duplicate document IDs, mismatched element/document ownership, duplicate source element keys, and explicitly selected documents that are absent.
- Rejected ZIP entry names containing dot segments, control characters, backslashes, traversal, absolute paths, or more than 4096 UTF-8 bytes.

### Compatibility verification

- Added a controlled synthetic WordPress 7 viewport-visibility fixture for the documented mobile, tablet, and desktop hidden classes.
- Added browser and integration regressions proving that effectively hidden WordPress-style subtrees are pruned before depth-budget consumption, while include-hidden mode preserves the evidence.
- Kept Runtime Snapshot and Runtime Package schemas at `1.4.0`; no artifact, permission, or architectural-boundary change was introduced.

### Documentation

- Corrected stale 1.5 headings in the Persian guide and embedded guide.
- Synchronized README, English/Persian help, compatibility matrix, Store release notes, and compatibility claims with the 1.6.1 patch scope.
- Explicitly labels WordPress 7 coverage as `verified_by_synthetic_fixture`, not complete real-site compatibility.

## [1.6.0] - 2026-06-15

### Added

- Conservative per-element runtime-instance evidence and deterministic document-instance boundaries.
- Preliminary source-to-runtime cardinality in snapshots and `coverage/source-runtime-cardinality.json`.
- Capture-state and capture-environment facts, including WordPress admin bar, editor preview, iframe, focus, scroll, visible modal, animation, sticky, pointer/hover, reduced-motion, and visible-image warnings.
- Computed-style origin availability that explicitly records resolved computed values without claiming CSSOM, Variable, Class, selector, or stylesheet origin.
- Manifest-derived version badges in the popup and side panel.
- Dedicated regression coverage for viewport-aware image readiness, hidden ancestor images, hidden subtree pruning, runtime instances, cardinality, and diagnostic deduplication.

### Fixed

- Hidden descendants are no longer traversed when `include_hidden_elements=false`; hidden subtrees are pruned before consuming depth and scan budgets.
- Capture readiness no longer stops solely after stable dimensions while an incomplete image is effectively visible in the viewport.
- Total incomplete images and in-viewport incomplete images are reported separately.
- Aggregate diagnostics are no longer duplicated between envelope and payload.
- `evidence_lineage.observation_id` was replaced by the accurate `snapshot_id` name.
- Repository tests now run in one bounded single-worker invocation, require a complete successful JSON report, and derive exact unit/security/integration partitions without skipping tests.
- The E2E preflight now detects a managed Linux browser policy that globally blocks unpacked extensions and reports it as environment-unavailable before launch.

### Changed

- Runtime Snapshot Schema and Runtime Package Schema advanced to `1.4.0`.
- Document metrics now separate bounded discovered/traversed and emitted scopes for Elementor, interactive, fixed, and sticky candidates.
- `schema-index.json` now validates against a strict closed schema.
- Page structure summaries include document-instance and repeated-instance-group counts.
- Runtime absence reason codes remain limited to evidence-grounded facts; speculative empty/conditional/dynamic causes are not emitted by Browser.

### Compatibility

- The frozen cross-product contract remains unchanged at the Browser 1.5.0 / Runtime Package 1.3.0 baseline. Python requires an explicit 1.4.0 ingestion adapter before coordinated compatibility can be claimed.

## [1.5.0] - 2026-06-14

### Added

- Evidence lineage linking each emitted runtime node to its page context, observation, source document, source element, nearest source section, and runtime node identity when evidence is available.
- Rendered-page and source-document separation, including multiple source documents such as page, header, footer, popup, and loop templates in one capture.
- Runtime structural regions and deterministic page structure summaries with section, container, widget, region, source-document, and binding counts.
- `structure/page-structure-summary.json` as a separately validated package artifact.
- Privacy-safe technical widget and structure markers plus explicit source editor labels when present in validated WordPress Bridge Context.
- A Page and source evidence card in the side panel showing Source Context, preliminary page binding, selected source document, source-document count, page fingerprint, and structure counts.
- Expanded source-binding reason codes and multi-document source matching.
- Dedicated schemas for diagnostics artifacts, schema index, and page structure summary.
- Regression tests for ancestor-hidden elements, hash-only locator privacy, exact package-validation inventories, multi-document binding, evidence lineage, and corrected collision semantics.

### Fixed

- Effective hidden-element filtering now excludes descendants hidden by an ancestor when hidden-element collection is disabled.
- Identity evidence now distinguishes `reference_occurrence_count` from real `collision_count`; unique references report one occurrence and zero collisions.
- Raw locator facts are withheld when path inclusion is disabled; privacy metadata now distinguishes RAW from HASH_ONLY disclosure.
- Readiness instability diagnostics include the observed causes instead of an empty context.
- Package self-validation now reports the exact JSON artifacts validated against dedicated schemas and rejects unregistered JSON artifacts.
- Source-document metadata, widget type, architecture kind, editor label, and nearest source section are preserved in preliminary binding evidence without claiming final correlation.

### Changed

- Runtime Snapshot Schema and Runtime Package Schema advanced to `1.3.0`.
- Capture-session summaries now preserve page identity, page binding, source-document, structure, and binding-coverage facts needed by the local UI.
- The built-in Persian and English documentation now explains page lineage, multi-document rendering, widget/section naming evidence, section structure, hidden-by-ancestor behavior, and locator-hash privacy.

### Security and privacy

- Section and widget labels are never inferred from visual meaning. Labels come only from explicit source editor metadata, privacy-permitted HTML IDs, landmarks, or bounded technical markers.
- Hash-only locator mode withholds raw paths while documenting that pseudonymous hashes remain privacy-sensitive matching evidence.
- Imported source labels remain bounded and schema validated.

## [1.3.0] - 2026-06-13

### Added

- Embedded offline Persian and English user guide linked from the popup, side panel, and options page.
- Standard and Deep DOM capture profiles with bounded coverage metrics.
- `capture_completeness` evidence, including visited/emitted counts, depth, truncation, budgets, and identity collision counts.
- `validation.json` in every successfully exported package.
- Runtime-environment evidence shared consistently by page, snapshot, and finalized session metadata.
- Identity source, status, uniqueness proof, collision count, and SHA-256 reference digest.

### Changed

- Advanced the evidence schema to `1.1.0` while keeping extension versioning independent.
- Export now performs embedded-schema, canonical JSON, checksum, referential-integrity, identity and package-manifest validation before download.
- Structural identities retain full deterministic ancestry to a stable anchor or document root.
- Review UI now distinguishes package integrity from capture completeness and explains every metric.
- Diagnostics now include configured limits, observed depth, truncated branch count, and first truncated reference.

### Fixed

- Removed the obsolete schema constraint that required extension version `1.1.0`.
- Prevented duplicate stable references from being presented as unique identities.
- Eliminated session/snapshot browser metadata drift.
- Made partial capture causes visible in UI and package metadata.

All notable changes follow Semantic Versioning.

## [1.2.1] - 2026-06-13

### Fixed

- Allowed trusted extension workflow pages, including the side-panel fallback opened in a normal browser tab, to communicate with the service worker while retaining extension-origin and top-frame validation.
- Added a regression test for tab-associated extension-page senders.
- Updated the popup to follow the persisted capture job through completion instead of leaving the user-facing status at `INJECTED`.

## [1.2.0] - 2026-06-13

### Hardened

- Replaced random session, job, snapshot, and request identifiers with deterministic sequence-derived identifiers.
- Defined and implemented the `EDIS-CJ-1` canonical JSON profile with stable key ordering, finite-number enforcement, negative-zero normalization, unsafe-key rejection, and terminal LF.
- Bound every capture to one persisted identifier and timestamp so service-worker recovery reproduces the same canonical snapshot bytes.
- Added strict sender, top-frame, tab, URL, document, payload, request-correlation, timeout, cancellation, chunk checksum, byte-length, and whole-snapshot integrity checks.
- Made capture start, chunk progress, final snapshot persistence, session summary updates, job completion, screenshot storage, and chunk cleanup transactional or recoverable.
- Added complete-chunk recovery and explicit stale-worker, navigation, cancellation, quota, and serialization diagnostics.
- Replaced unbounded document-wide metrics queries with the same bounded traversal used for evidence collection.
- Hardened identity uniqueness, CSS escaping, path and identifier redaction, geometry normalization, style-value bounds, and safe download names.
- Made package records, diagnostics, snapshots, checksums, and ZIP entries deterministic; added duplicate-path, traversal, entry-size, total-size, and screenshot-integrity rejection.
- Added production scans for dynamic evaluation, randomness, network-capable APIs, source maps, unexpected permissions, persistent content scripts, and target drift.
- Added deterministic export, worker recovery, malformed sender, large DOM, identifier, ZIP, and package validation tests.
- Added a persistent-context Playwright extension harness with dynamic extension-ID discovery, explicit browser executable validation, service-worker lifecycle control, local fixtures, traces, browser logs, console capture, and bounded failure exit codes.
- Added browser specifications for runtime measurements, Elementor V3/V4/hybrid identity, semantic replay, screenshots, navigation and mutation stress, privacy, extension network isolation, export verification, and accessibility.
- Added disabled-by-default bounded redacted text previews and raw text-layout evidence without form-value collection or UX interpretation.
- Added reproducible release packaging, coordinated release gates, release-evidence generation, manual compatibility templates, and Chrome Web Store submission materials.

## [1.1.0] - 2026-06-13

### Changed

- Added ready-to-load Chrome and Edge build artifacts with `manifest.json` at the package root.
- Enforced a top-level runtime snapshot schema with deterministic document-order elements.
- Restricted evidence to viewport, geometry, allowlisted computed styles, identity, visibility, overflow, diagnostics, and optional screenshots.
- Removed text-content and accessibility-verdict collection paths.
- Moved preferences from synchronized storage to extension-local storage.
- Added stronger sender, URL, payload, snapshot, chunk, screenshot, and export validation.
- Added safe stale-job recovery, session-state repair, duplicate-chunk rejection, and screenshot size limits.
- Limited production targets to Chrome and Microsoft Edge.

## [1.0.0] - 2026-06-13

### Added

- Initial development-grade user-triggered runtime evidence collector.
