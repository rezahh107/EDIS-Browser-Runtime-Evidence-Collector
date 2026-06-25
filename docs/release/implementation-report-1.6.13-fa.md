# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.13

## ۱. خلاصهٔ اجرایی

```yaml
نسخه_مبدأ: 1.6.12
نسخه_تحویلی: 1.6.13
تاریخ: 2026-06-24
یافته‌های_تأییدشده_اصلاح‌شده: 4
اصلاح_جزئی: 0
اصلاح_نشده: 0
تغییر_قرارداد_شواهد: false
تغییر_نسخه_اسکیما: false
تغییر_مجوز_مرورگر: false
نیاز_به_مهاجرت_دیتابیس: false
```

نسخهٔ 1.6.13 سیاست Workflow و Export را fail-closed می‌کند، بدون آن‌که Readiness، Factها یا Schemaهای شواهد را تغییر دهد. Session دارای `workflow_mode: null` دیگر نمی‌تواند Minimum Python Feed تولید کند. Session قدیمی دارای Capture نیز Runtime-only باقی می‌ماند و به‌صورت خاموش به Minimum ارتقا داده نمی‌شود.

## ۲. نگاشت یافته‌ها به اصلاحات

### `POLICY-001` — Null workflow برای Minimum Feed مجاز بود

```yaml
status: FIXED
severity: medium
```

**علت:** `isExportPurposeAllowed(null, purpose)` برای هر Purpose مقدار `true` می‌داد.

**اصلاح:** `null` فقط `RUNTIME_EVIDENCE` را مجاز می‌کند.

**فایل‌ها:**

- `src/domain/exportPolicy.ts`
- `tests/unit/exportPolicy.test.ts`
- `tests/integration/exportPreflight.test.ts`
- `tests/integration/pythonFeedWorkflow.test.ts`

**اثر:** Session فاقد Provenance صریح حتی با Readiness کامل Minimum Feed تولید نمی‌کند.

### `POLICY-002` — Legacy captured session می‌توانست در Capture بعدی Minimum شود

```yaml
status: FIXED
severity: medium
```

**علت:** `workflow_mode: null` در اولین Capture جدید با Payload جایگزین می‌شد، حتی اگر Session از قبل Capture داشت.

**اصلاح:** تابع `effectiveSessionWorkflowMode` اضافه شد. Session خالی قابل انتخاب است؛ Session دارای Capture و mode نامشخص Runtime-only است. Background و Side Panel هر دو از این Policy استفاده می‌کنند.

**فایل‌ها:**

- `src/domain/capturePolicy.ts`
- `src/background/captureCoordinator.ts`
- `src/sidepanel/index.ts`
- `tests/unit/capturePolicy.test.ts`

### `POLICY-003` — Fallback function برای ورودی غیر Minimum خودبسنده نبود

```yaml
status: FIXED
severity: low
```

**علت:** تابع فقط Purpose و Runtime blockers را می‌سنجید و به مجازبودن Runtime export تکیه داشت.

**اصلاح:** Fallback اکنون صریحاً `workflowMode === MINIMUM_PYTHON_FEED` را الزامی می‌کند.

**فایل‌ها:**

- `src/domain/exportPolicy.ts`
- `tests/unit/exportPolicy.test.ts`

### `CI-001` — مسیر بحرانی Browser فقط هفتگی اجرا می‌شد

```yaml
status: FIXED
severity: medium
```

**اصلاح:** Job جدید `e2e-smoke` برای Push و Pull Request اضافه شد. تست Export fallback با `@smoke` علامت‌گذاری شد. Runner از `--test-file` و `--grep` پشتیبانی می‌کند و همچنان Environment preflight را اجرا می‌کند.

**فایل‌ها:**

- `.github/workflows/ci.yml`
- `package.json`
- `scripts/run-e2e.mjs`
- `tests/e2e/privacy-network-package.spec.ts`

### `DOC-001` و `DOC-002`

```yaml
status: FIXED
severity: low
```

Performance release در README از 1.6.12 به 1.6.11 اصلاح شد و تعداد تست فعلی به 198 تغییر کرد.

### ادعای Error context اشتباه

```yaml
status: REJECTED_WITH_EVIDENCE
code_changed: false
```

Failure frame در `tests/e2e/harness.ts` صحیح بود. تغییر Product لازم نبود.

### ادعای رهاشدن تمام Performance fixes

```yaml
status: REJECTED_WITH_EVIDENCE
code_changed: false
```

اصلاحات Performance نسخهٔ 1.6.11 در Source 1.6.13 موجودند. Risk انتقال رشته‌ای Snapshot همچنان در known limitations ثبت شده است.

## ۳. تغییرات Dependency

`undici` انتقالی از 7.27.2 به 7.28.0 ارتقا یافت. علت، Advisoryهای گزارش‌شده توسط `npm audit` بود. پس از Update:

```yaml
full_dependency_vulnerabilities: 0
production_dependency_vulnerabilities: 0
```

## ۴. نسخه و قرارداد

```yaml
collector: 1.6.13
runtime_snapshot_schema: 1.6.0
capture_session_schema: 1.1.0
python_feed_readiness_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
```

هیچ Schema یا Permission تغییر نکرد.

## ۵. تست‌های افزوده یا توسعه‌یافته

- ۳ تست جدید Capture policy.
- Null-mode case در Export policy.
- Runtime/null negative fallback cases.
- Preflight mismatch برای Legacy session.
- Package builder rejection با Readiness کامل و Workflow null.
- Smoke E2E علامت‌گذاری‌شده برای fallback download.

مجموع Repository: ۱۹۸ آزمون در ۵۵ فایل.

## ۶. نتایج Gate

```yaml
release_gate_no_browser: passed
external_package_validation: 4_of_4_passed
reproducible_build: passed
chrome_package: passed
edge_package: passed
schema_validation: passed
full_dependency_audit: 0
```

Smoke E2E محلی به‌دلیل Policy مدیریتی Chromium `UNAVAILABLE` شد و Pass اعلام نشده است.

## ۷. ریسک باقی‌مانده

- اجرای واقعی Job `e2e-smoke` در GitHub یا Chrome unmanaged هنوز باید ثبت شود.
- Edge E2E واقعی اجرا نشده است.
- String transport Snapshot و ماتریس واقعی WordPress/Elementor محدودیت‌های قبلی هستند.

## ۸. مهاجرت

Migration دیتابیس لازم نیست. Sessionهای موجود خوانده می‌شوند. Session Legacy دارای Capture و mode نامشخص فقط Runtime package می‌سازد. برای Feed باید Session جدید تحت Workflow صریح Minimum ایجاد شود.
