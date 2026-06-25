# EDIS Browser Runtime Evidence Collector — User Guide

Version 1.6.16

## Minimum Python Feed

Use **Export minimum Python feed** only after importing and confirming the matching WordPress Source Context, then capturing Desktop, Tablet, and Mobile with three distinct measured viewport widths in one session. The requested profile is provenance only; it is not a resolved Elementor breakpoint. All observations must share one runtime page fingerprint and one Source Context reference. If any requirement is missing, the minimum-feed export remains blocked with deterministic evidence codes, while the same session can be exported one-way as ordinary Runtime Evidence. This fallback does not change facts, readiness, or the session's recorded capture workflow.

A ready feed includes `source-context/wordpress-source-context.json` and `validation/python-feed-readiness.json`. Readiness establishes consistent input availability, not successful correlation or an analytical result.

## Canonical guided capture in 1.6.16

In **Minimum Python Feed** mode, Source Context must be imported and confirmed before capture. The side panel probes the target page and displays its actual viewport. A capture is blocked before job creation when the required profile was already used, the measured viewport width already exists in the session, the page fingerprint changed, or Source Context is missing or incompatible. These guards do not apply to ordinary Runtime Evidence mode, where repeated widths may represent different interaction states.

The requested profile remains user provenance only. The collector does not infer Elementor breakpoint semantics from a width.

## Canonical Python Feed requirements

Minimum Python Feed capture order is unrestricted, but the completed session must contain unique `DESKTOP`, `TABLET`, and `MOBILE` requested profiles and three distinct measured CSS-pixel widths. The collector records labels and measured dimensions only; it does not infer or name Elementor breakpoints.

Before creating a feed capture job, the collector requires scroll `(0,0)`, `document.visibilityState === "visible"`, a non-prerendered document, no iframe or Elementor editor-preview context, no active or ambiguous WordPress Admin Bar evidence, and no unresolved image intersecting the viewport after the bounded image-decode policy. Loss of document focus caused by interaction with the side panel is warning-only and does not by itself invalidate Python evidence. LCP is not used as readiness evidence.

## Export preflight and recovery

The preflight displays **Blocking requirements** separately from **Non-blocking coverage warnings**. Blocking requirements disable the requested Minimum Python Feed action. When the current session already contains an exportable runtime observation, **Export runtime evidence instead** creates an ordinary runtime package without Source Context embedding and without claiming Python-feed readiness. Runtime Evidence is the default workflow for new sessions.

## Purpose

The extension records bounded rendered-page evidence after an explicit user action. It does not interpret UX quality. WordPress supplies saved source evidence, Browser supplies runtime evidence, Python performs final joining and analysis, and the LLM explains Python output.

## Personal-use profile

This build is optimized for private Load Unpacked use. Stability, recovery, bounded resource consumption, and deterministic local export take priority over Chrome Web Store submission work. Version 1.6.16 includes dedicated policy, preflight, package-builder, and browser-dialog regressions; exact executed results are recorded in `docs/release/test-results-1.6.16.md`. Browser runtime E2E is `insufficient_evidence` in this environment because no usable Chrome executable was provided and the Playwright Chromium binary is absent; exact Chrome/Edge runtime and a real WordPress/Elementor fixture matrix remain evidence gaps.

## Installation

1. Extract the Chrome or Edge package.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Select **Load unpacked**.
5. Choose the folder containing `manifest.json` directly at its root.

## Screens

### Popup

Use the popup for quick capture, current-session selection, page eligibility, and capture progress.

### Side panel

The Page and source evidence card distinguishes the rendered page from imported WordPress source documents. It shows preliminary page binding, selected source document, source-document count, a shortened page fingerprint, and the latest section/container/widget/runtime-region counts.

The installed manifest version appears at the top of both the popup and side panel.

The side panel has five stages:

1. **Page check** — verifies that the active tab is a normal HTTP/HTTPS page.
2. **Session setup** — groups related viewport observations.
3. **Capture** — creates one factual snapshot after your click.
4. **Review** — shows completeness, elements, overflow, diagnostics, truncation, hidden-subtree pruning, capture-environment warnings, and storage.
5. **Export** — performs self-validation and downloads the local ZIP.

### Options

Options control:

- Standard, Deep DOM, or Custom traversal limits;
- capture intent, which is descriptive only;
- screenshots and text preview opt-ins;
- privacy-safe text shape;
- interaction facts;
- relationship graph;
- color styles, hidden elements, page path, and title;
- local WordPress Bridge Context import.

## WordPress Bridge Context

Import `bridge/source-context.json` from WordPress Evidence Exporter 3.2.0 when you want preliminary source binding.

The file is parsed locally, validated against its bundled contract, size/depth bounded, prototype-pollution checked, and hashed. The extension never contacts WordPress and never executes imported content. Capture without context remains valid.

Raw observed markers remain separate from interpreted fields. User confirmation is provenance only and cannot turn conflicting or duplicate evidence into `EXACT`.

## Binding states

- `EXACT` — unique compatible runtime/source marker evidence with compatible page evidence.
- `PROBABLE` — useful but incomplete evidence, such as ancestor binding or missing page marker.
- `AMBIGUOUS` — duplicate or conflicting evidence.
- `UNMATCHED` — no source candidate was established.

These are preliminary browser bindings. Python owns final correlation.

## Evidence modules

### Evidence lineage, page identity, widgets, and sections

Every emitted runtime node carries a page-context reference, observation identity, source document and source element keys when binding evidence exists, its nearest source section, and its runtime node ID. A rendered page may contain several source documents such as the page, header, footer, popup, or loop template.

Widget and section names are never guessed from visual appearance. Technical widget markers can come from DOM classes; exact widget type and explicit editor labels come only from validated WordPress Source Context. Section labels are limited to explicit editor labels, HTML IDs when the privacy mode permits them, landmark tags/roles, or technical Elementor structure markers.

The package includes `structure/page-structure-summary.json`, while each snapshot includes `runtime_regions` and `page_structure_summary`. These are deterministic indexes and observations, not UX conclusions. Python owns the merged page graph and final correlation.

### Relationship graph

Records the real DOM parent and, separately, the nearest emitted parent. It also records nearest positioned, scrolling, and clipping ancestors. This preserves DOM truth even when bounded traversal omits an ancestor.

### Interaction facts

Records factual fields such as tag, role, tabindex, disabled state, pointer-events, cursor, and presence flags. It does not export href values, form values, event handlers, or accessible names by default.

### Privacy-safe text shape

Records text-node count, grapheme count, word count, line boxes, long-token length, wrapping, line clamp, and clipping. It excludes form controls and contenteditable content. Raw text preview is a separate disabled-by-default option.

### Capture readiness

For a bounded time, records document state, font API status, all incomplete images, effectively visible incomplete images, active animations, and document/viewport size changes. Offscreen or effectively hidden incomplete images do not block stable readiness. A visible incomplete image keeps readiness active until it completes or the hard budget is exhausted. The collector does not mutate the page or stop animations.

### Runtime instances, document boundaries, and cardinality

Validated source markers may group one saved source element with zero, one, or several direct runtime candidates. This is preliminary evidence only. `REPEATED_TEMPLATE` requires validated `loop-item` source-document evidence; otherwise repeated roots remain `MULTIPLE_RUNTIME_ROOTS`. Document instances preserve disconnected runtime roots for page, header, footer, popup, loop-item, or other imported document types when relationship evidence is enabled.

### Capture state and environment

The snapshot records scroll position, focus, document visibility, pointer/hover capability, reduced-motion preference, animation count, and sticky candidates. Environment warnings may report a WordPress admin bar, Elementor editor preview, iframe capture, unfocused document, non-top scroll position, visible modal, active animations, or incomplete visible images. Warnings do not block capture.

### Computed-style origin availability

The collector records resolved computed values. It explicitly reports that CSSOM rule-origin inspection was not performed and does not claim that a value came from a Variable, Global Class, stylesheet, or selector.

## Capture profiles

| Profile  | Element limit | Depth limit | Typical use                   |
| -------- | ------------: | ----------: | ----------------------------- |
| Standard |           750 |          24 | Most pages                    |
| Deep DOM |          1000 |          40 | Deeply nested Elementor pages |
| Custom   |    Up to 1000 |    Up to 64 | Controlled bounded tests      |

A technically valid package may contain a `PARTIAL` capture when a budget or depth limit was reached.

## Privacy

With **Include normalized URL path** disabled, both the legacy raw path and raw `locator_facts` are withheld. A pseudonymous locator hash remains for later matching; hashed paths can still be privacy-sensitive and should be handled accordingly. With hidden-element collection disabled, effectively hidden descendant subtrees are pruned before they consume depth or scan budget. The package records skipped subtree count and a known direct-child lower bound, not a fabricated full descendant count.

Strict path privacy does not anonymize the site origin; scheme, host, and port may still be present.

The extension does not export input values, password values, hidden-input values, textarea values, select values, href values, form actions, event handlers, cookies, history, URL queries, URL fragments, telemetry, analytics, or remote uploads. Screenshots may contain visible sensitive pixels and therefore require explicit opt-in.

## Exported package

```text
package-manifest.json
checksums.sha256
README.txt
observation-set.json
context/runtime-context.json
context/source-context-reference.json        (optional)
coverage/runtime-coverage.json
coverage/source-binding-coverage.json
coverage/source-runtime-cardinality.json
structure/page-structure-summary.json
observations/observation-0001/snapshot.json
observations/observation-0001/screenshot.png (optional)
diagnostics/diagnostics.json
validation/package-validation.json
schemas/...
```

All JSON artifacts use EDIS-CJ-1 canonical bytes. Shared digests use `sha256:<64 lowercase hexadecimal characters>`.

## Recommended capture practice

Use a logged-out or Incognito page when public-page evidence is required, wait for the intended page state, return the page to scroll position `(0,0)`, capture each viewport separately, import the matching WordPress source context, and send the WordPress and Browser ZIP files separately to Python.

## WordPress 7 compatibility

Version 1.6.16 retains the controlled synthetic fixture for the documented WordPress 7 viewport-visibility classes. It verifies Browser Collector behavior only: a block that is effectively hidden at the current viewport is omitted with its descendants when hidden-element collection is disabled, and the omitted subtree does not consume depth budget. This fixture is `verified_by_synthetic_fixture`; it is not a real WordPress export or proof of complete WordPress 7+, Multisite, Elementor, theme, or PHP compatibility.
