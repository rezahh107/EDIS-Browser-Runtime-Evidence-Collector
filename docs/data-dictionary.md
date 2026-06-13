# Data Dictionary

## Page

`origin` is always normalized. `path` is optional. Query, fragment, credentials, cookies, browsing history, local-storage values, and form values are excluded. Document language, direction, readiness, visibility, browser family, platform category, and Elementor marker presence are facts.

## Viewport

Records inner and outer dimensions, device-pixel ratio, visual-viewport dimensions and offsets when available, orientation, scrollbar presence, actual user label, and evidence-label status. A descriptive label is never treated as an official breakpoint without an external manifest match.

## Element

Records stable identity evidence, parent reference, sibling index, finite geometry, viewport intersection, client/scroll/offset dimensions, raw allowlisted computed styles, overflow, clipping, offscreen, positioning, text metrics, and interactive-element facts. Text previews and screenshots are opt-in.

## Diagnostics

Each diagnostic has `code`, `severity`, `message`, `recoverable`, and a bounded context object. Messages shown to users omit sensitive internals.
