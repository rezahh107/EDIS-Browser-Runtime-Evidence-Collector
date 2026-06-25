# نتایج اعتبارسنجی EDIS Runtime Collector 1.6.16

```yaml
collector_version: 1.6.16
validation_date: 2026-06-25
status: repository_and_release_integrity_validated_with_browser_runtime_gap
```

## Clean release gate

Gate از وضعیت زیر شروع شد:

```text
artifacts/release-gate: absent
artifacts/reproducibility: absent
artifacts/packages: absent
artifacts/release-provenance: absent
```

سپس خود Gate Evidence جدید را تولید کرد و با Exit Code صفر پایان یافت.

## Repository tests

```yaml
repository_tests: 222_passed_of_222
test_files: 59
unit_tests: 121
security_tests: 11
integration_tests: 90
failed: 0
skipped_pending_todo: 0
```

آزمون‌های جدید علاوه بر پوشش قبلی، Pin شدن Actionها، رد rolling tag و الزام ترتیب واقعی Clean Gate و Source provenance را بررسی می‌کنند.

## Gateهای بدون مرورگر

```yaml
workflow_action_references: 12_of_12_full_sha
workflow_pin_policy: passed
typecheck: passed
eslint: passed
stylelint: passed
prettier: passed
schema_documents: 20
unique_schema_ids: 19
source_security_scan_files: 215
chrome_package_validation: passed
edge_package_validation: passed
chrome_edge_common_files: 49_identical
external_package_validation: 4_of_4_passed
reproducible_build: 102_files_including_zip_bytes
store_manual_documents: 27
full_dependency_vulnerabilities: 0
production_dependency_vulnerabilities: 0
```

## Artifact provenance

```yaml
source_zip: edis-runtime-collector-source-1.6.16.zip
source_entry_count: 365
chrome_zip: edis-runtime-collector-chrome-1.6.16.zip
chrome_zip_bytes: 1377320
chrome_shipped_equals_rebuilt: true
edge_zip: edis-runtime-collector-edge-1.6.16.zip
edge_zip_bytes: 1377285
edge_shipped_equals_rebuilt: true
```

Gate مستقل، Source ZIP را Extract کرد و هر دو Build را از همان Source بازسازی کرد. SHA-256 و طول بایت Build بازسازی‌شده با Artifact تحویلی یکسان بود.

## Browser runtime

```yaml
automated_playwright_chromium: insufficient_evidence
exact_google_chrome: insufficient_evidence
exact_microsoft_edge: insufficient_evidence
product_test_failure_observed: false
browser_suite_completed: false
```

اجرای واقعی با Exit Code `2` متوقف شد، زیرا هیچ Chrome executable قابل‌استفاده ارائه نشده بود و Chromium رسمی Playwright نیز در Cache محلی وجود نداشت. این وضعیت به‌عنوان `PASS` یا شکست محصول گزارش نشده است.

## Evidence files

- `artifacts/release-gate/command-results.json`
- `artifacts/release-gate/repository-tests-results.json`
- `artifacts/release-gate/repository-tests-runner.json`
- `artifacts/release-gate/unit-tests-results.json`
- `artifacts/release-gate/security-tests-results.json`
- `artifacts/release-gate/integration-tests-results.json`
- `artifacts/release-gate/workflow-actions.json`
- `artifacts/reproducibility/reproducibility.json`
- `artifacts/release-provenance/release-provenance.json`
