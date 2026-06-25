# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.12

## ۱. خلاصهٔ اجرایی

```yaml
نسخه_مبدأ: 1.6.11
نسخه_تحویلی: 1.6.12
تاریخ: 2026-06-19
یافته‌های_اصلاح‌شده: 4
یافته‌های_اصلاح_جزئی: 0
یافته‌های_اصلاح‌نشده: 0
مهاجرت_داده: ندارد
تغییر_Schema: ندارد
تغییر_Permission: ندارد
```

نسخهٔ 1.6.12 بن‌بست Export را بدون تضعیف قرارداد Minimum Python Feed برطرف می‌کند. Session نوع `MINIMUM_PYTHON_FEED` می‌تواند به‌صورت یک‌طرفه یک Package معمولی `RUNTIME_EVIDENCE` بسازد، اما مسیر معکوس همچنان ممنوع است. این تبدیل هیچ Snapshot، Readiness، Diagnostic، Source Context، `workflow_mode` یا Fact ثبت‌شده‌ای را تغییر نمی‌دهد.

بهبودهای اصلی:

- سیاست واحد و Fail-closed برای سازگاری Workflow و Export Purpose؛
- نمایش مستقل Blockerها و Warningها در Preflight؛
- Action صریح «خروجی Runtime Evidence به‌جای خوراک پایتون»؛
- نمایش هم‌زمان Runtime Export برای Sessionهای Minimum؛
- Workflow پیش‌فرض Runtime Evidence؛
- پوشش واحد، Integration و E2E برای ماتریس Workflow/Purpose و مسیر Download جایگزین.

## ۲. نگاشت یافته به اصلاح

### `EXP-001` — نبود مسیر Runtime Evidence برای Session ناقص Minimum Python Feed

```yaml
status: FIXED
شدت: High
```

**علت ریشه‌ای:** `workflow_mode` هم به‌عنوان Provenance Capture و هم به‌عنوان ممنوعیت مطلق Export Purpose استفاده می‌شد.

**فایل‌های اصلی:**

- `src/domain/exportPolicy.ts`
- `src/application/exportUseCase.ts`
- `src/infrastructure/packageBuilder.ts`
- `src/sidepanel/index.ts`

**پیاده‌سازی:**

- تابع واحد `isExportPurposeAllowed()` اضافه شد.
- `MINIMUM_PYTHON_FEED -> RUNTIME_EVIDENCE` مجاز شد.
- `RUNTIME_EVIDENCE -> MINIMUM_PYTHON_FEED` همچنان ممنوع ماند.
- Fallback فقط وقتی ارائه می‌شود که Runtime Export مانع مستقل نداشته باشد؛ یعنی Session حداقل یک Observation داشته باشد و در وضعیت Capturing یا Failed نباشد.
- Package Runtime از Session Minimum، Source Context را Embed نمی‌کند و نام `edis-runtime-package-*` را حفظ می‌کند.

**اثر مورد انتظار:** حذف Capture مجدد اجباری و بازیابی فوری شواهد موجود، بدون ایجاد Python Feed ناقص یا ادعای Readiness.

### `EXP-002` — ادغام Blocking Errors با Coverage Warnings

```yaml
status: FIXED
شدت: Medium
```

**علت ریشه‌ای:** مدل Application دو آرایهٔ مستقل داشت، اما UI آن‌ها را در یک Container با عنوان Warning نمایش می‌داد.

**فایل‌های اصلی:**

- `src/sidepanel/index.html`
- `src/sidepanel/index.ts`
- `src/sidepanel/index.css`
- `src/sidepanel/exportPreflightView.ts`
- `_locales/en/messages.json`
- `_locales/fa/messages.json`

**پیاده‌سازی:**

- بخش‌های مستقل `Blocking requirements` و `Non-blocking coverage warnings` اضافه شد.
- پیام صریح برای حالت دارای Fallback و حالت بدون Fallback افزوده شد.
- دکمهٔ Feed در حضور Blocker Disabled می‌ماند.
- Action جایگزین Runtime فقط در وضعیت مجاز نمایش داده می‌شود.
- `dialog.returnValue` پیش از نمایش Reset می‌شود و سه نتیجهٔ صریح `export`، `runtime-evidence` و `cancel` مدیریت می‌شوند.

**اثر مورد انتظار:** حذف برداشت اشتباه «خرابی ZIP/Worker»، کاهش Capture تکراری و روشن‌شدن علت توقف.

### `EXP-003` — پوشش آزمون ناقص مسیر گزارش‌شده

```yaml
status: FIXED
شدت: Medium
```

**علت ریشه‌ای:** ماتریس Workflow/Purpose و رفتار واقعی Dialog/Download پوشش داده نشده بود.

**فایل‌های آزمون:**

- `tests/unit/exportPolicy.test.ts`
- `tests/unit/exportPreflightView.test.ts`
- `tests/unit/defaultWorkflow.test.ts`
- `tests/integration/exportPreflight.test.ts`
- `tests/integration/pythonFeedWorkflow.test.ts`
- `tests/e2e/privacy-network-package.spec.ts`
- `tests/unit/schemaVersioning.test.ts`

**پوشش افزوده‌شده:**

- مجازبودن Downgrade یک‌طرفه؛
- ممنوع‌بودن Upgrade معکوس؛
- Fallback فقط در نبود Runtime blocker؛
- جداسازی Blocker و Warning در View State؛
- Preflight ناکافی Minimum همراه با Runtime fallback؛
- ساخت Package Runtime از Session Minimum؛
- نبود Source Context جاسازی‌شده در Runtime package؛
- پیش‌فرض Runtime Evidence در HTML؛
- آزمون Playwright برای Dialog، Disabled button، Fallback و Download.

**اثر مورد انتظار:** جلوگیری از بازگشت بن‌بست Export و تثبیت سیاست Fail-closed.

### `RISK-001` — Workflow سخت‌گیرانه به‌عنوان انتخاب پیش‌فرض

```yaml
status: FIXED
شدت: Low
```

**علت ریشه‌ای:** گزینهٔ `MINIMUM_PYTHON_FEED` در HTML دارای `selected` بود.

**فایل‌های اصلی:**

- `src/sidepanel/index.html`
- `tests/unit/defaultWorkflow.test.ts`
- `README.md`
- `HELP.md`
- `HELP_FA.md`

**پیاده‌سازی:** Runtime Evidence به انتخاب پیش‌فرض تبدیل شد. کاربر همچنان می‌تواند پیش از نخستین Capture، Minimum Python Feed را آگاهانه انتخاب کند.

**اثر مورد انتظار:** کاهش ورود تصادفی به Workflow مسدودشونده و کاهش خطای عملیاتی.

## ۳. تغییرات کامل مخزن

### فایل‌های اصلاح‌شده

- `CHANGELOG.md`
- `GENERATION_MANIFEST.json`
- `HELP.md`
- `HELP_FA.md`
- `README.md`
- `VALIDATION.txt`
- `_locales/en/messages.json`
- `_locales/fa/messages.json`
- `docs/architecture.md`
- `docs/compatibility-matrix.md`
- `docs/privacy-model.md`
- `docs/release/test-results.md`
- `docs/release/unexecuted-browser-tests.md`
- `docs/schema-reference.md`
- `docs/troubleshooting.md`
- `package-lock.json`
- `package.json`
- `project.config.json`
- `src/application/exportUseCase.ts`
- `src/domain/model.ts`
- `src/guide/index.html`
- `src/infrastructure/packageBuilder.ts`
- `src/manifest/chrome.json`
- `src/manifest/edge.json`
- `src/sidepanel/index.css`
- `src/sidepanel/index.html`
- `src/sidepanel/index.ts`
- `tests/e2e/privacy-network-package.spec.ts`
- `tests/integration/exportPreflight.test.ts`
- `tests/integration/pythonFeedWorkflow.test.ts`
- `tests/unit/schemaVersioning.test.ts`

### فایل‌های جدید

- `docs/release/1.6.12-release-notes.md`
- `docs/release/contract-delta-1.6.12.md`
- `docs/release/implementation-report-1.6.12-fa.md`
- `docs/release/test-results-1.6.12.md`
- `src/domain/exportPolicy.ts`
- `src/sidepanel/exportPreflightView.ts`
- `store/chrome/listing/release-notes-1.6.12.md`
- `tests/unit/defaultWorkflow.test.ts`
- `tests/unit/exportPolicy.test.ts`
- `tests/unit/exportPreflightView.test.ts`

### فایل‌های حذف‌شده

`هیچ‌کدام`

### تغییرات پیکربندی

- نسخهٔ Extension و Package از `1.6.11` به `1.6.12` ارتقا یافت.
- Runtime Snapshot Schema روی `1.6.0` ثابت ماند.
- Capture Session Schema روی `1.1.0` ثابت ماند.
- Python Feed Readiness Schema روی `1.1.0` ثابت ماند.
- Runtime Package Manifest Schema روی `1.4.1` ثابت ماند.
- Permission، Host Permission، CSP و Build target تغییر نکردند.

### مهاجرت

```yaml
migration_required: false
indexeddb_version_changed: false
existing_sessions_supported: true
```

Sessionهای 1.6.11 بدون تبدیل داده خوانده می‌شوند. پس از نصب 1.6.12، Session Minimum ناکافی می‌تواند در صورت داشتن Observation معتبر به Runtime Evidence صادر شود.

## ۴. به‌روزرسانی اعتبارسنجی

```yaml
repository_tests: 192_passed_of_192
unit_tests: 108
security_tests: 11
integration_tests: 73
test_files: 54
failed: 0
skipped_pending_todo: 0
typescript: pass
eslint: pass
stylelint: pass
format: pass
schema_validation: 20_documents_19_unique_ids_pass
external_package_validation: 4_of_4_pass
chrome_package_validation: pass
edge_package_validation: pass
chrome_edge_common_files: 49_identical
reproducible_build: 102_files_including_zip_bytes_pass
store_manual_documents: 27_pass
production_vulnerabilities: 0
```

Vitest گزارش JSON کامل ۱۹۲ Assertion را نوشت، اما یک Handle داخلی پس از پایان باز ماند. Process فقط پس از تأیید کامل‌بودن گزارش، تطبیق شمارش‌ها و صفر بودن Failure/Skip/Todo بسته شد.

### وضعیت مرورگر واقعی

```yaml
chrome_runtime_e2e: insufficient_evidence
edge_runtime_e2e: insufficient_evidence
```

آزمون Playwright Fallback اضافه شده است. executable پیش‌فرض Playwright موجود نبود؛ Chromium سیستم نیز Extension Service Worker را در مهلت ۲۰ ثانیه راه‌اندازی نکرد. هیچ اجرای مسدودشده‌ای Pass اعلام نشده است.

### مراحل توصیه‌شدهٔ اعتبارسنجی بیرونی

```text
npm ci
npm run check
EDIS_CHROME_EXECUTABLE_PATH=<path> npm run test:e2e:chrome
EDIS_EDGE_EXECUTABLE_PATH=<path> npm run test:e2e:edge
```

در آزمون دستی، یک Session Minimum دارای یک Observation بسازید، Export Minimum را باز کنید، تفکیک Blocker/Warning و Disabled بودن Feed را بررسی کنید، سپس Runtime fallback را انتخاب و ZIP را با validator مستقل کنترل کنید.

## ۵. ریسک‌های باقی‌مانده

### `BROWSER-QUAL-001`

```yaml
status: insufficient_evidence
reason: محیط فعلی Service Worker افزونهٔ Load Unpacked را اجرا نکرد
potential_impact: رفتار واقعی Dialog و Download در Chrome و Edge هنوز در این محیط تأیید نشده است
future_mitigation: اجرای Playwright و آزمون دستی روی Chrome و Edge واقعی با Load Unpacked
```

هیچ ریسک کدی شناخته‌شدهٔ دیگری از یافته‌های ممیزی بدون اصلاح باقی نمانده است.

## نتیجه

نسخهٔ 1.6.12 هر چهار یافتهٔ گزارش Export را پوشش می‌دهد، هیچ Blocker خوراک Python را حذف نمی‌کند، هیچ Fact را بازنویسی نمی‌کند و Repository آمادهٔ جایگزینی مستقیم، Build و اعتبارسنجی بیرونی است. ادعای صلاحیت Runtime مرورگر تا اجرای E2E بیرونی محدود می‌ماند.
