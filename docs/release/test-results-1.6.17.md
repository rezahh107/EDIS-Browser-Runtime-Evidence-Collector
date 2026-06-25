# Test Results — 1.6.17

## Repository tests

Executed command:

```bash
npx vitest run --reporter=dot
```

Result: PASS

- Test files: 64 passed
- Tests: 251 passed

## Targeted release-blocker regression tests

Executed command:

```bash
npx vitest run tests/unit/responseEnvelopeValidation.test.ts tests/unit/diagnostics.test.ts tests/unit/uiMessageProtocol.test.ts tests/integration/storageReliabilityMatrix.test.ts tests/integration/snapshotScreenshotSizeMatrix.test.ts tests/integration/serviceWorkerRecoveryMatrix.test.ts tests/integration/documentBindingAndRestrictedPages.test.ts --reporter=dot
```

Result: PASS

- Test files: 7 passed
- Tests: 39 passed

## Static/build/store checks

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run format:check`: PASS
- `npm run validate:schemas`: PASS
- `npm run build`: PASS
- `npm run validate`: PASS
- `npm run validate:package:external`: PASS
- `npm run validate:store`: PASS
- `npm audit --omit=dev`: PASS, 0 vulnerabilities
- `npm run build:reproducible`: PASS, 103 files compared, 0 mismatches

## Exact browser qualification

- Chrome Stable exact packaged artifact: INSUFFICIENT_EVIDENCE. `EDIS_CHROME_EXECUTABLE_PATH` was not available in this environment.
- Microsoft Edge Stable exact packaged artifact: INSUFFICIENT_EVIDENCE. `EDIS_EDGE_EXECUTABLE_PATH` was not available in this environment.

Evidence paths:

- `artifacts/browser-e2e/chrome/environment-unavailable.json`
- `artifacts/browser-e2e/edge/environment-unavailable.json`
- `artifacts/browser-e2e/browser-qualification.json`
