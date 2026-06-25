# نتایج اعتبارسنجی EDIS Runtime Collector 1.6.12

```yaml
collector_version: 1.6.12
validation_date: 2026-06-19
status: passed_with_browser_runtime_gap
```

## Gateهای اجراشده و موفق

```text
npx eslint "src/**/*.ts" "tests/**/*.ts"
npx stylelint "src/**/*.css"
npm run typecheck
npm run format:check
npx vitest run tests/unit tests/security tests/integration --pool=threads --maxWorkers=2 --reporter=json
npm run validate:schemas
npm run build
npm run validate
npm run validate:package:external
npm run build:reproducible
npm run validate:store
npm audit --omit=dev
```

```yaml
repository_tests: 192_passed_of_192
unit_tests: 108
security_tests: 11
integration_tests: 73
test_files: 54
failed: 0
skipped_pending_todo: 0
schema_documents: 20
unique_schema_ids: 19
external_package_validation: 4_of_4_passed
chrome_package_validation: passed
edge_package_validation: passed
chrome_edge_common_files: 49_identical
reproducible_build: 102_files_including_zip_bytes
store_manual_documents: 27
production_vulnerabilities: 0
source_security_scan_files: 206
```

Vitest پس از نوشتن گزارش JSON کامل، یک Handle داخلی را باز نگه داشت. Process پس از تأیید کامل‌بودن گزارش، تطبیق تعداد Assertionها و موفقیت ۱۹۲ از ۱۹۲ آزمون به‌صورت کنترل‌شده بسته شد. هیچ نتیجه‌ای از خروجی ناقص استنباط نشد.

## آزمون مرورگری اختصاصی Fallback

آزمون زیر به Suite مرورگر اضافه شد:

```text
tests/e2e/privacy-network-package.spec.ts
blocked minimum feed offers a runtime-evidence fallback download
```

دو تلاش اجرا شد:

1. مسیر پیش‌فرض Playwright وجود نداشت:
   `ENOENT ... chromium-1223/chrome-linux64/chrome`
2. با Chromium سیستم در `/usr/bin/chromium`، حالت Headless و `--no-sandbox`، Service Worker افزونه ظرف ۲۰ ثانیه ظاهر نشد.

```yaml
chrome_runtime_e2e: insufficient_evidence
edge_runtime_e2e: insufficient_evidence
reason: unpacked_extension_service_worker_not_available_in_current_environment
```

آزمون مرورگری اجرا‌نشده یا مسدودشده به‌عنوان موفق گزارش نشده است.
