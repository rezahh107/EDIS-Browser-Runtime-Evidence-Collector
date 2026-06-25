# START HERE — EDIS Runtime Collector 1.6.19

## Files

- Source package: `source/edis-runtime-collector-source-1.6.19.zip`
- Chrome build: `builds/edis-runtime-collector-chrome-1.6.19.zip`
- Edge build: `builds/edis-runtime-collector-edge-1.6.19.zip`
- Main Persian handover: `reports/EDIS-Runtime-Collector-1.6.19-Handover-FA.md`
- Release evidence: `reports/release-evidence.json` and `reports/release-evidence.md`
- Browser qualification: `browser-e2e/browser-qualification.json`
- Uploaded runtime package validation: `runtime-validation/personal-runtime-validation.json`

## Recommendation

- Personal/local/manual use: CONDITIONAL_GO
- Official/store-ready release: NO_GO until exact Chrome Stable and Edge Stable packaged-artifact qualification pass.

## Important commands

```bash
npm ci
npm run check
npm run package:release:verified
node scripts/validate-personal-runtime-packages.mjs <chrome-export.zip> <edge-export.zip>
```
