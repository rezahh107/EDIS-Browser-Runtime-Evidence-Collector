# نتایج اعتبارسنجی EDIS Runtime Collector 1.6.15

```yaml
collector_version: 1.6.15
validation_date: 2026-06-25
status: repository_validated_with_browser_runtime_gap
```

## Repository tests

```yaml
repository_tests: 218_passed_of_218
test_files: 57
unit_tests: 121
security_tests: 11
integration_tests: 86
failed: 0
skipped_pending_todo: 0
```

آزمون‌های جدید شامل Canonical cycle/limits، Browser qualification provenance، legacy chunk integrity و IndexedDB v3→v4 migration هستند.

## Gateهای بدون مرورگر

```yaml
typecheck: passed
eslint: passed
stylelint: passed
prettier: passed
schema_documents: 20
unique_schema_ids: 19
source_security_scan_files: 210
chrome_package_validation: passed
edge_package_validation: passed
chrome_edge_common_files: 49_identical
external_package_validation: 4_of_4_passed
reproducible_build: 102_files_including_zip_bytes
store_manual_documents: 27
full_dependency_vulnerabilities: 0
production_dependency_vulnerabilities: 0
```

## Buildهای تولیدی

```yaml
chrome_zip: edis-runtime-collector-chrome-1.6.15.zip
chrome_zip_bytes: 1377274
edge_zip: edis-runtime-collector-edge-1.6.15.zip
edge_zip_bytes: 1377239
production_files_each_target: 50
```

اندازه‌ها مربوط به Build اجراشده پیش از تولید نهایی Handover هستند؛ SHA-256 نهایی در گزارش تحویل بیرونی ثبت می‌شود.

## Browser runtime

### تلاش با Chromium سیستم

```yaml
status: insufficient_evidence
requested_target: chrome
actual_family: chromium
version: Chromium 144.0.7559.96
exit_code: 2
reason: managed_ExtensionInstallBlocklist_blocks_unpacked_extensions
```

### تلاش نصب Playwright Chromium

```yaml
status: unavailable
exit_code: 1
reason: EAI_AGAIN_cdn.playwright.dev
```

هیچ آزمون مرورگری شروع نشد؛ هیچ نتیجهٔ Pass یا Product failure گزارش نمی‌شود. Exact Google Chrome و Microsoft Edge همچنان `insufficient_evidence` هستند.

## Artifactهای Evidence

- `artifacts/release-gate/repository-tests-results.json`
- `artifacts/release-gate/repository-tests-runner.json`
- `artifacts/release-gate/unit-tests-results.json`
- `artifacts/release-gate/security-tests-results.json`
- `artifacts/release-gate/integration-tests-results.json`
- `artifacts/reproducibility/reproducibility.json`
- `artifacts/browser-e2e-resilience/environment-unavailable.json`
- `artifacts/browser-e2e-resilience/browser-qualification.json`
