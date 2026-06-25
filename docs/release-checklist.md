# Release Checklist

## Automated gates

- Confirm version consistency in package metadata, Chrome/Edge manifests, changelog, schemas, and collector constants.
- Use the committed npm lockfile and `npm ci`.
- Run `npm run release:gate:no-browser` for source, schema, security, build, package, and reproducibility validation.
- Run `npm run test:e2e:smoke` on Push/Pull Request with Playwright Chromium and preserve its artifacts.
- Run `npm run release:gate:chrome` with a compatible real Chrome executable.
- Run `npm run release:gate:edge` with a compatible real Edge executable.
- Preserve browser traces, screenshots, video, console logs, network records, exports, and release evidence.
- Verify `manifest.json` is at the root of each installable package.
- Verify no remote code, telemetry, broad host access, unsupported permissions, string-based timers, source maps, test hooks, or external assets.
- Verify canonical JSON, semantic replay, worker recovery, navigation cancellation, finite-number rejection, privacy fixtures, ZIP paths, checksums, and local-only storage behavior.

## Manual gates

- Complete `docs/manual-compatibility-test-plan.md` on Chrome 116, current stable Chrome, and current stable Edge with required Windows coverage.
- Record every result using `docs/manual-compatibility-results-template.md`; never infer a pass from automated tests.
- Complete keyboard, zoom, RTL, reduced-motion, screenshot, restart, storage recovery, and external-request checks.

## Store administration

- Publish an externally reachable privacy-policy URL.
- Publish an externally reachable support URL.
- Complete developer contact and store account administration.
- Complete listing, Privacy practices, permission justifications, screenshots, promotional assets, reviewer instructions, and rollback ownership.
- Match the submitted package SHA-256 to `release-evidence.json`.

No no-browser run may declare full store readiness.
