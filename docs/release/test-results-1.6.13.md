# نتایج اعتبارسنجی EDIS Runtime Collector 1.6.13

```yaml
collector_version: 1.6.13
validation_date: 2026-06-24
status: passed_with_browser_runtime_gap
```

## Gate کامل بدون مرورگر

فرمان:

```text
npm run release:gate:no-browser
```

نتیجه:

```yaml
exit_code: 0
typecheck: passed
eslint: passed
stylelint: passed
format: passed
repository_tests: 198_passed_of_198
unit_tests: 112
security_tests: 11
integration_tests: 75
test_files: 55
failed: 0
skipped_pending_todo: 0
schema_documents: 20
unique_schema_ids: 19
source_security_scan_files: 207
chrome_package_validation: passed
edge_package_validation: passed
chrome_edge_common_files: 49_identical
reproducible_build: 102_files_including_zip_bytes
store_manual_documents: 27
production_vulnerabilities: 0
```

## اعتبارسنجی مستقل Package

فرمان:

```text
npm run validate:package:external
```

نتیجه:

```yaml
external_package_validation: 4_of_4_passed
```

## Audit وابستگی‌ها

پس از ارتقای انتقالی `undici` از 7.27.2 به 7.28.0:

```text
npm audit --audit-level=low
npm audit --omit=dev
```

```yaml
full_dependency_vulnerabilities: 0
production_dependency_vulnerabilities: 0
```

## Smoke E2E مرورگر

فرمان تلاش‌شده:

```text
xvfb-run --auto-servernum env \
  EDIS_CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
  EDIS_E2E_HEADLESS=false \
  EDIS_E2E_ALLOW_NO_SANDBOX=true \
  EDIS_E2E_CAPTURE_MEDIA=true \
  EDIS_E2E_ARTIFACT_DIR=artifacts/browser-e2e-smoke-local \
  npm run test:e2e:smoke
```

نتیجه:

```yaml
chrome_smoke_e2e: insufficient_evidence
exit_code: 2
reason: managed_browser_policy_blocks_unpacked_extensions
policy: ExtensionInstallBlocklist=["*"]
```

Preflight در `/etc/chromium/policies/managed/000_policy_merge.json` ممنوعیت Load Unpacked را تشخیص داد. Suite اجرا نشد و نتیجه Pass گزارش نمی‌شود.

تلاش برای نصب Chromium بستهٔ Playwright نیز با `EAI_AGAIN cdn.playwright.dev` شکست خورد؛ این شکست شبکه‌ای نتیجهٔ Product test نیست.

## Artifactهای شواهد

- `artifacts/release-gate/command-results.json`
- `artifacts/release-gate/command-results.md`
- `artifacts/reproducibility/reproducibility.json`
- `artifacts/reproducibility/reproducibility.md`
- `artifacts/browser-e2e-smoke-local/environment-unavailable.json`
- `artifacts/browser-e2e-smoke-local/environment-unavailable.txt`
