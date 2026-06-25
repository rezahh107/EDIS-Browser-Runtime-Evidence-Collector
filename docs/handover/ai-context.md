# زمینهٔ کامل برای ادامه توسط AI

## نقش پروژه

این مخزن Browser Runtime Collector خط لولهٔ EDIS است. هنگام ادامهٔ کار باید بین Engineering Mode و Evidence Interpretation Mode تفکیک شود. این فایل برای Engineering Mode نوشته شده است.

## تقدم منابع

1. `docs/contracts/EDIS-Cross-Product-Contract-Freeze-v1.0.0.md`
2. Schemaها، Registryها و اسناد Versioned فعلی.
3. Fixtureها و Assertions معتبر.
4. پیاده‌سازی فعلی 1.6.14.
5. پیشنهادها یا گفتگوهای تأییدنشده.

تعارض‌ها باید گزارش شوند؛ قواعد ناسازگار نباید بی‌صدا Merge شوند.

## مرزهای معماری غیرقابل نقض

### WordPress Evidence Exporter

مالک Saved Source، Persistence، Provenance، Registry و Metadata است. نباید Final resolution یا UX analysis انجام دهد.

### Browser Runtime Collector

مالک Runtime DOM، Geometry، Computed Styles، Relationships، Interaction state و Capture readiness است. نباید Reference resolution، Formula، Rule، Score یا Final correlation انجام دهد.

### Python Deterministic Engine

مالک Validation، Merge، Graph، Resolution، Formula، Correlation، Diagnostics و TruthReport است.

### LLM

در Evidence Interpretation فقط خروجی Python را توضیح می‌دهد. در Engineering می‌تواند Code/Test/Schema بسازد ولی Domain behavior مستندنشده اختراع نمی‌کند.

## نسخه‌ها

```yaml
collector: 1.6.14
runtime_snapshot_schema: 1.6.0
capture_session_schema: 1.1.0
observation_set_schema: 1.1.0
python_feed_readiness_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
canonicalization: EDIS-CJ-1
url_normalization: EDIS-URL-1
hash: sha256
```

Schemaها در 1.6.14 تغییر نکرده‌اند.

## سیاست Workflow قطعی

```text
MINIMUM_PYTHON_FEED -> Runtime: allowed
MINIMUM_PYTHON_FEED -> Feed: readiness-gated
RUNTIME_EVIDENCE -> Runtime: allowed
RUNTIME_EVIDENCE -> Feed: forbidden
null -> Runtime: allowed
null -> Feed: forbidden
```

Session دارای Capture با `workflow_mode: null` Runtime-only است. این قاعده را تضعیف نکن.

## Truth policy

- فقط دادهٔ Explicit یا Derived دترمینیستیک گزارش شود.
- Proposal نباید Observed تلقی شود.
- نبود شواهد با `status: insufficient_evidence` ثبت شود.
- Browser نباید Value، Breakpoint، Unit، ID، Relationship یا Registry entry مفقود را حدس بزند.

## الزامات دترمینیسم

- Collectionهای unordered پیش از serialization/hash مرتب شوند.
- Canonical JSON با ترتیب ثابت.
- NaN و Infinity رد شوند.
- SHA-256 روی bytes canonical.
- ZIP path، timestamp، ordering و permission ثابت.
- Observation index یکتا و contiguous.
- هیچ Global mutable state پنهان برای Factها.

## امنیت و حریم خصوصی

- Remote code ممنوع.
- `eval`، `new Function` و dynamic remote import ممنوع.
- Telemetry و Upload ممنوع.
- Host permission دائمی ممنوع مگر Contract جدید صریح.
- Form values، password، href، query، fragment و raw text به‌صورت پیش‌فرض جمع نشوند.
- Screenshot و Text Preview opt-in.
- Prototype pollution، unsafe JSON، ZIP traversal و message forgery fail-closed.

## عملکرد

بهینه‌سازی‌های 1.6.11 باید حفظ شوند:

- Capture-scoped WeakMap caches.
- Per-capture Identity/Source indexes.
- Text evidence reuse.
- Mutation-aware image readiness.
- Export Worker.
- Table-driven CRC و preallocated ZIP buffer.
- Cursor-based IndexedDB maintenance.
- Adaptive non-overlapping polling.

Refactor نباید این Cacheها را به State پایدار بین Captureها تبدیل کند.

## استاندارد کدنویسی

- TypeScript strict.
- `exactOptionalPropertyTypes` و `noUncheckedIndexedAccess` فعال.
- ورودی خارجی `unknown` و سپس validate.
- API عمومی بدون تأیید Breaking change تغییر نکند.
- Diagnostic code ثابت و تست‌شده.
- تغییر کوچک و هدفمند؛ refactor نامرتبط ممنوع.
- هر Rule یا Policy جدید Unit و Integration test داشته باشد.

## CI و Release

- `quality`: Gate کامل بدون Browser روی همهٔ eventها.
- `e2e-smoke`: Push/PR، فقط مسیر `@smoke` Export fallback.
- `e2e-nightly`: Suite کامل Chrome هفتگی.
- Release workflow: full Chrome gate روی tag/dispatch.

Playwright extension test باید Persistent Context و Chromium قابل side-load استفاده کند.

## وضعیت تست 1.6.14

```yaml
repository_tests: 218
unit: 114
security: 11
integration: 80
failed: 0
schema_validation: passed
package_validation: passed
reproducible_build: passed
full_dependency_audit: 0
production_dependency_audit: 0
local_browser_smoke: unavailable_no_browser_executable
```

## نقاط خطر ادامهٔ کار

- تغییر `workflow_mode` برای Session دارای Capture.
- تفسیر Profile به‌عنوان Elementor breakpoint.
- Embed کردن Source Context در Runtime package عادی.
- انتقال Correlation یا Formula به Browser.
- ادعای E2E Pass بدون Artifact واقعی.
- حذف تست به‌جای رفع مشکل.

## اولین فایل‌هایی که AI جدید باید بخواند

1. این فایل.
2. `session-recovery.md`.
3. Frozen contract.
4. `src/domain/exportPolicy.ts` و `src/domain/capturePolicy.ts`.
5. `src/application/exportUseCase.ts`.
6. `src/infrastructure/packageBuilder.ts`.
7. CI workflow و تست‌های Export policy.
