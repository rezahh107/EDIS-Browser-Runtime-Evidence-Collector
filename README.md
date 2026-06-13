# EDIS Browser Runtime Evidence Collector

Version `1.0.0` is a local-only Manifest V3 browser extension that records rendered-page facts for deterministic analysis by EDIS Python. It measures viewport, DOM geometry, allowlisted computed styles, overflow, visibility, positioning, text metrics, interactive-element facts, and Elementor markers when present. It does not score UX, change pages, monitor browsing, use telemetry, or upload data.

## Supported release targets

Chrome and Microsoft Edge are the production targets. The Firefox boundary is implemented through a browser adapter and an event-page manifest, but Firefox release compatibility is not claimed until its dedicated end-to-end suite passes.

## Build

Prerequisites are Node.js 20 or newer and pnpm 11.

```text
pnpm install
pnpm typecheck
pnpm test:unit
pnpm build:chrome
```

Load `dist/chrome` as an unpacked extension. Use `pnpm build:edge` for Edge. The default `pnpm build` follows `project.config.json`, generated for target `chrome`.

A lockfile is intentionally absent because the Python generator never runs a package manager. Run `pnpm install` once in a network-approved development environment, review the resolved graph, commit the resulting real lockfile, then use frozen installs in CI.

## Workflow

Open a normal HTTP or HTTPS page, invoke the extension, create or select a session, capture the current viewport, review privacy-sensitive options, and export a local evidence ZIP. Viewport labels are descriptive; actual browser dimensions are always recorded independently.

## Data boundaries

Default capture excludes full text, input values, textarea values, passwords, cookies, browsing history, local-storage contents, URL queries, URL fragments, and authentication material. Screenshots and text previews require explicit opt-in.

## Quality commands

```text
pnpm check
pnpm test:e2e
pnpm audit
```

End-to-end extension tests require a compatible Chromium installation and a built `dist/chrome` directory. No test result is asserted by this repository documentation.

See `docs/architecture.md`, `docs/privacy-model.md`, `docs/threat-model.md`, and `docs/reviewer-guide.md` for implementation and review details.
