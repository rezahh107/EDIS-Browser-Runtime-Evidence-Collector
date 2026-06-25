# نتایج اعتبارسنجی EDIS Runtime Collector 1.6.14

```yaml
collector_version: 1.6.14
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
repository_tests: 205_passed_of_205
unit_tests: 114
security_tests: 11
integration_tests: 80
test_files: 56
failed: 0
skipped_pending_todo: 0
schema_documents: 20
unique_schema_ids: 19
source_security_scan_files: 209
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

## آزمون‌های رگرسیون افزوده یا توسعه‌یافته

- توقف پیمایش TextNode پس از پرشدن بودجهٔ قطعی.
- index خطی sibling و `nth-of-type` برای ۱۵۰۰ عنصر.
- View بدون کپی Entryهای ZIP روی Buffer آرشیو.
- Query گروهی Screenshot و حسابداری تجمعی Session در IndexedDB.
- جلوگیری از اجرای تکراری Maintenance در بازهٔ زمانی مشخص.
- Readiness افزایشی تصاویر پس از Mutation یک زیر‌درخت.
- انتقال Summary سبک Sessionها در `STATE_GET` بدون Capture arrayهای کامل.

## Buildهای تولیدی

```yaml
chrome_zip: edis-runtime-collector-chrome-1.6.14.zip
chrome_zip_bytes: 1366945
edge_zip: edis-runtime-collector-edge-1.6.14.zip
edge_zip_bytes: 1366910
production_files_each_target: 50
```

Build بازتولیدپذیر دو بار اجرا شد و تمام ۱۰۲ فایل، شامل Byteهای ZIP تولیدی، بدون مغایرت بودند.

## Audit وابستگی‌ها

فرمان:

```text
npm audit --omit=dev
```

نتیجه:

```yaml
production_dependency_vulnerabilities: 0
```

## Smoke E2E مرورگر

فرمان تلاش‌شده:

```text
npm run test:e2e:smoke
```

نتیجه:

```yaml
chrome_smoke_e2e: insufficient_evidence
exit_code: 2
reason: no_usable_chrome_executable_and_playwright_chromium_absent
```

Suite مرورگر اجرا نشد و نتیجهٔ Pass گزارش نمی‌شود. این محدودیت، شکست Product test نیست؛ نبود محیط اجرایی مرورگر است.

## Artifactهای شواهد

- `artifacts/release-gate/command-results.json`
- `artifacts/release-gate/command-results.md`
- `artifacts/release-gate/repository-tests-results.json`
- `artifacts/release-gate/repository-tests-runner.json`
- `artifacts/reproducibility/reproducibility.json`
- `artifacts/reproducibility/reproducibility.md`
- `artifacts/browser-e2e/environment-unavailable.json`
- `artifacts/browser-e2e/environment-unavailable.txt`
