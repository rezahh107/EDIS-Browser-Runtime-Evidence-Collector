# Release evidence index

Expected generated evidence:

- `release-evidence.json`
- `release-evidence.md`
- `artifacts/release-gate/command-results.json`
- `artifacts/release-gate/command-results.md`
- `artifacts/reproducibility/reproducibility.json`
- `artifacts/reproducibility/reproducibility.md`
- `artifacts/browser-e2e/environment.json` or `environment-unavailable.txt`
- Playwright JSON, HTML, trace, screenshot, video, and console artifacts when execution is available
- Chrome and Edge production ZIP packages
- SHA-256 inventory
- Changed-file inventory
- Completed manual compatibility records
- Final store asset inventory

Each release decision must reference the exact immutable package hashes tested. Unavailable evidence is recorded as unavailable, never omitted or converted to a pass.
