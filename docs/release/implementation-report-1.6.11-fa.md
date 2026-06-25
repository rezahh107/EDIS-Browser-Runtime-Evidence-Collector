# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.11

## ۱. خلاصهٔ اجرایی

```yaml
نسخه_مبدأ: 1.6.10
نسخه_تحویلی: 1.6.11
تاریخ: 2026-06-19
کل_یافته‌ها: 10
اصلاح_کامل: 8
اصلاح_جزئی: 2
اصلاح_نشده: 0
تغییر_قرارداد_خارجی: false
تغییر_نسخه_اسکیما: false
تغییر_مجوز_مرورگر: false
```

هشت مورد به‌طور کامل اصلاح شدند: `PERF-001` تا `PERF-005`، `PERF-007`، `PERF-008` و `RISK-001`.

دو مورد به‌صورت محافظه‌کارانه و مستند اصلاح جزئی شدند:

- `PERF-006`: آرایهٔ کامل Chunkها در Content حذف، Assembly نهایی preallocated و کپی‌های میانی کم شد؛ اما انتقال Content به Background عمداً رشته‌ای باقی ماند تا قرارداد پیام موجود بدون صلاحیت‌سنجی مرورگر تغییر نکند.
- `RISK-002`: خواندن کامل Chunkها از Status حذف و Polling به backoff محدود و غیرهم‌پوشان تبدیل شد؛ ولی Push event جدید اضافه نشد تا سطح پیام داخلی و رفتار UI بدون شواهد Runtime تغییر نکند.

بهبودهای اصلی معماری عبارت‌اند از Context اجرایی محدود به Capture، Indexهای immutable محدود به Capture، Worker اختصاصی Export، نگه‌داری Cursor-based در IndexedDB و حفظ کامل مرز مالکیت Browser/Python.

## ۲. نگاشت یافته به اصلاح

### PERF-001 — `FIXED`

- **علت ریشه‌ای:** خواندن مستقل Style، Rectangle، Visibility و ancestor relationships در چند مرحله.
- **فایل‌های اصلی:**
  - `src/content/measurements/context.ts`
  - `src/content/measurements/geometry.ts`
  - `src/content/measurements/visibility.ts`
  - `src/content/measurements/styles.ts`
  - `src/content/selectors/selectElements.ts`
  - `src/content/collectors/element.ts`
  - `src/content/index.ts`
- **پیاده‌سازی:** یک `CaptureMeasurementContext` با `WeakMap`های Style، Rect، Visibility، Geometry، ancestor summary و Identity ساخته شد. Selection و Collection همان Context را مصرف می‌کنند. روابط positioned/scroll/clipping از یک خلاصهٔ ancestor مشترک استفاده می‌کنند.
- **اثر مورد انتظار:** حذف خواندن‌های تکراری Style و Layout در همان Capture و کاهش Long Taskهای ناشی از DOM readهای تکراری.
- **اعتبارسنجی:** `tests/integration/performanceCaching.test.ts` تعداد `getComputedStyle` را برای زنجیرهٔ کامل کمتر یا مساوی تعداد عناصر سند الزام می‌کند.

### PERF-002 — `FIXED`

- **علت ریشه‌ای:** ساخت مجدد Identity Index و اجرای selector uniqueness برای هر reference.
- **فایل‌های اصلی:** `src/domain/identity.ts`, `src/content/collectors/element.ts`.
- **پیاده‌سازی:** `IdentityContext` شامل Index یک‌باره، cache کاندیدا و cache reference اضافه شد. `stableDomReference` و `markerOccurrenceCount` Context مشترک می‌گیرند. `querySelectorAll(reference)` از مسیر Identity حذف شد.
- **اثر مورد انتظار:** تبدیل صدها اسکن کامل سند به یک Index در هر Capture و lookupهای ثابت.

### PERF-003 — `FIXED`

- **علت ریشه‌ای:** جست‌وجوی خطی Source Context، marker counts و page evidence در حلقهٔ هر عنصر.
- **فایل اصلی:** `src/content/collectors/element.ts`.
- **پیاده‌سازی:** Mapهای `elementorId → SourceCandidate[]` و `documentId → elementId → record`، cache بخش Source، cache marker هر عنصر و page evidence یک‌باره ساخته شدند.
- **اثر مورد انتظار:** lookupهای Source به `O(1)` یا `O(k)` محدود می‌شوند؛ هزینهٔ اسکن Context دیگر در تعداد runtime node ضرب نمی‌شود.

### PERF-004 — `FIXED`

- **علت ریشه‌ای:** TreeWalker و Range تکراری برای subtree هر عنصر و allocation مکرر Segmenter/array.
- **فایل اصلی:** `src/content/collectors/element.ts`.
- **پیاده‌سازی:** Text Nodeها یک بار در Document walk آماده می‌شوند؛ line evidence هر Text Node cache می‌شود؛ Segmenterهای grapheme/word در سطح ماژول reuse می‌شوند؛ شمارش segment بدون spread array انجام می‌شود.
- **اثر مورد انتظار:** کاهش بازپیمایش متن nested، allocationهای Range/Segment و فشار GC.

### PERF-005 — `FIXED`

- **علت ریشه‌ای:** اسکن همهٔ تصاویر و ancestor/layout read در هر نمونهٔ ۱۰۰ میلی‌ثانیه‌ای.
- **فایل‌های اصلی:**
  - `src/content/readiness/viewportImages.ts`
  - `src/content/readiness/captureReadiness.ts`
- **پیاده‌سازی:** `ViewportImageReadinessSession` مجموعهٔ candidate، Promiseهای decode و failure state را حفظ می‌کند. بازسازی فقط پس از Mutation انجام می‌شود و Observer در `dispose` قطع می‌گردد.
- **اثر مورد انتظار:** کاهش اسکن تصویر از حداکثر ده‌ها پاس به یک یا چند پاس وابسته به Mutation.

### PERF-006 — `PARTIALLY FIXED`

- **علت ریشه‌ای:** نگه‌داری هم‌زمان canonical string، byte buffer، آرایهٔ Chunk string، joined string، assembled bytes و parsed object.
- **فایل‌های اصلی:**
  - `src/content/index.ts`
  - `src/background/captureCoordinator.ts`
- **پیاده‌سازی:** Chunk array به generator تبدیل شد؛ status preflight برای هر Chunk حذف شد؛ Background ابتدا طول را محاسبه و سپس یک `Uint8Array` نهایی preallocate می‌کند؛ `join` کامل حذف شد.
- **محدودیت:** canonical string در producer و parsed graph در consumer همچنان لازم‌اند. انتقال Binary بدون تغییر پروتکل و تست Chrome/Edge انجام نشد.
- **اثر مورد انتظار:** حذف نگه‌داری آرایهٔ کامل Chunkها و حداقل یک representation کامل در finalization؛ کاهش Peak memory بدون تغییر رفتار.

### PERF-007 — `FIXED`

- **علت ریشه‌ای:** CRC32 بیت‌به‌بیت، چند concat کامل، کپی `Uint8Array.from` و اجرای Export در Thread رابط.
- **فایل‌های اصلی:**
  - `src/infrastructure/zip.ts`
  - `src/infrastructure/download.ts`
  - `src/infrastructure/exportWorkerClient.ts`
  - `src/workers/exportWorker.ts`
  - `src/application/exportUseCase.ts`
  - `build.mjs`
  - `scripts/validate-package.mjs`
- **پیاده‌سازی:** CRC32 table-driven، محاسبهٔ اندازهٔ نهایی و نوشتن مستقیم ZIP32 در یک buffer، حذف کپی Download، و انتقال Build/Validation/ZIP به Dedicated Worker با transferable ArrayBuffer.
- **اثر اندازه‌گیری‌شده در Node:** برای ۳۲ MiB زمان ۳۰٫۷٪ و allocation اضافی ArrayBuffer حدود ۶۰٪ کاهش یافت. نتیجهٔ مرورگر واقعی هنوز `insufficient_evidence` است.

### PERF-008 — `FIXED`

- **علت ریشه‌ای:** Hash تکراری entryها، ساخت مجدد RegExp و `uniqueItems` جفتی.
- **فایل‌های اصلی:**
  - `src/infrastructure/packageBuilder.ts`
  - `src/infrastructure/externalPackageValidation.ts`
  - `src/infrastructure/schemaValidation.ts`
- **پیاده‌سازی:** digestهای validation reuse می‌شوند؛ external validator cache digest مشترک دارد؛ patternها compile/cache می‌شوند؛ uniqueness با structural key پایدار و `Set` بررسی می‌شود. Validation مستقل حذف نشده و داخل Worker اجرا می‌شود.
- **اثر مورد انتظار:** کاهش Hash/Regex/مقایسهٔ تکراری با حفظ Gateهای صحت و امنیت.

### RISK-001 — `FIXED`

- **علت ریشه‌ای:** سه `getAll()` هم‌زمان و نگه‌داری payload همهٔ Chunkها.
- **فایل اصلی:** `src/infrastructure/storage/indexedDb.ts`.
- **پیاده‌سازی:** Jobها با Cursor خوانده می‌شوند؛ Chunk و Metadata در Cursorهای جریان‌وار پردازش، حذف و aggregate می‌شوند؛ فقط aggregate فعال‌ها و Job metadata در حافظه می‌مانند.
- **اثر مورد انتظار:** نزدیک‌شدن حافظهٔ maintenance از حجم کل Chunk data به اندازهٔ Job/aggregate metadata.

### RISK-002 — `PARTIALLY FIXED`

- **علت ریشه‌ای:** polling ثابت، status مبتنی بر `listChunks` و preflight پیام برای هر Chunk.
- **فایل‌های اصلی:**
  - `src/background/captureCoordinator.ts`
  - `src/content/index.ts`
  - `src/popup/index.ts`
  - `src/sidepanel/index.ts`
  - `src/infrastructure/storage/indexedDb.ts`
- **پیاده‌سازی:** Status از `ChunkAggregateRecord` استفاده می‌کند و فقط هنگام finalization واقعی Chunkها را می‌خواند؛ preflight per-chunk حذف شد؛ Polling از ۲۵۰ ms با backoff تا ۲ ثانیه و deadline قبلی اجرا می‌شود؛ Guard refresh غیرهم‌پوشان و در حالت hidden کم‌تکرار است.
- **محدودیت:** Push notification اضافه نشد؛ polling سازگار به‌عنوان fallback اصلی باقی است.
- **اثر مورد انتظار:** کاهش محسوس message round-trip و IndexedDB reads در Captureهای طولانی.

## ۳. تغییرات کامل مخزن

### فایل‌های اصلاح‌شده

- `CHANGELOG.md`
- `GENERATION_MANIFEST.json`
- `HELP.md`
- `HELP_FA.md`
- `README.md`
- `VALIDATION.txt`
- `build.mjs`
- `docs/architecture.md`
- `docs/compatibility-matrix.md`
- `docs/manual-compatibility-results-template.md`
- `docs/privacy-model.md`
- `docs/release/test-results.md`
- `docs/schema-reference.md`
- `package-lock.json`
- `package.json`
- `project.config.json`
- `schemas/schema-index.json`
- `scripts/validate-package.mjs`
- `src/application/exportUseCase.ts`
- `src/background/captureCoordinator.ts`
- `src/content/collectors/element.ts`
- `src/content/index.ts`
- `src/content/measurements/geometry.ts`
- `src/content/measurements/styles.ts`
- `src/content/measurements/visibility.ts`
- `src/content/readiness/captureReadiness.ts`
- `src/content/readiness/viewportImages.ts`
- `src/content/selectors/selectElements.ts`
- `src/domain/identity.ts`
- `src/domain/model.ts`
- `src/guide/index.html`
- `src/infrastructure/download.ts`
- `src/infrastructure/externalPackageValidation.ts`
- `src/infrastructure/packageBuilder.ts`
- `src/infrastructure/schemaValidation.ts`
- `src/infrastructure/storage/indexedDb.ts`
- `src/infrastructure/zip.ts`
- `src/manifest/chrome.json`
- `src/manifest/edge.json`
- `src/popup/index.ts`
- `src/sidepanel/index.ts`
- `tests/integration/indexedDb.test.ts`
- `tests/unit/schemaVersioning.test.ts`

### فایل‌های جدید

- `docs/release/1.6.11-release-notes.md`
- `docs/release/contract-delta-1.6.11.md`
- `docs/release/performance-results-1.6.11.md`
- `docs/release/implementation-report-1.6.11-fa.md`
- `src/content/measurements/context.ts`
- `src/infrastructure/exportWorkerClient.ts`
- `src/workers/exportWorker.ts`
- `store/chrome/listing/release-notes-1.6.11.md`
- `tests/integration/performanceCaching.test.ts`

### فایل‌های حذف‌شده

`none`

### تغییرات پیکربندی و مهاجرت

- نسخهٔ Extension از `1.6.10` به `1.6.11` ارتقا یافت.
- `package.json`، `package-lock.json`، `project.config.json`، Manifestهای Chrome/Edge و producer نسخه در Schema Index هم‌راستا شدند.
- Build اکنون `workers/export-worker.js` را برای هر Target تولید می‌کند و Package Validator حضور آن را الزام می‌کند.
- Migration داده یا Schema لازم نیست؛ DB version، artifact schemaها و package paths ثابت مانده‌اند.

## ۴. به‌روزرسانی اعتبارسنجی

### تست جدید

- `tests/integration/performanceCaching.test.ts`
  - cache reuse میان Selection و Collection را کنترل می‌کند.
  - بازگشت الگوی چندبارخوانی `getComputedStyle` را fail می‌کند.

### تست به‌روزشده

- `tests/integration/indexedDb.test.ts`
  - صحت `ChunkAggregateRecord` پس از ۱۰۰ Chunk را بررسی می‌کند.
- `tests/unit/schemaVersioning.test.ts`
  - Collector `1.6.11` را با Runtime Schema ثابت `1.6.0` کنترل می‌کند.

### نتایج اجراشده

```yaml
typecheck: pass
lint: pass
format: pass
repository_tests: 183_pass_0_fail_0_skip
unit: 102
security: 11
integration: 70
schema_documents: 20
unique_schema_ids: 19
external_package_validation: 4_of_4_pass
source_security_scan: 201_files_pass
chrome_package: pass
edge_package: pass
common_build_files_equal: 49
reproducible_files: 102
store_documents: 27_pass
production_vulnerabilities: 0
```

### مراحل پیشنهادی تأیید بیرونی

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. اجرای Vitest کامل و بررسی ۱۸۳ تست
6. `npm run validate:schemas`
7. `npm run build`
8. `npm run validate`
9. `npm run validate:package:external`
10. `npm run build:reproducible`
11. `npm run validate:store`
12. `npm audit --omit=dev`
13. اجرای E2E در Chrome و Edge واقعی که Load Unpacked را مجاز می‌دانند.
14. ثبت Performance/Memory profile با صفحهٔ واقعی Elementor بزرگ و Export نزدیک سقف.

## ۵. ریسک‌های باقی‌مانده

### انتقال رشته‌ای Snapshot

- **دلیل باقی‌ماندن:** تغییر به ArrayBuffer در پیام Content/Background نیازمند قرارداد داخلی جدید و qualification واقعی Chrome/Edge است.
- **اثر بالقوه:** برای Snapshot نزدیک سقف، canonical string و encoded bytes هنوز هم‌زمان بخشی از Peak memory را تشکیل می‌دهند.
- **کاهش آتی:** طراحی پروتکل versioned مبتنی بر Port/transferable، Fixture سازگاری و آزمون interruption قبل از جایگزینی.

### نبود Push status

- **دلیل باقی‌ماندن:** افزودن پیام unsolicited و lifecycle جدید بدون E2E مرورگر، ریسک race و UI state divergence داشت.
- **اثر بالقوه:** تعداد محدودی Poll همچنان باقی است.
- **کاهش آتی:** اضافه‌کردن event versioned با polling fallback پس از آزمون MV3 worker suspension/restart.

### نبود پروفایل مرورگر واقعی

- **دلیل باقی‌ماندن:** محیط فعلی اجرای قابل اعتماد افزونهٔ unpacked را فراهم نکرد.
- **اثر بالقوه:** عدد دقیق Long Task، Heap peak و Worker startup ناشناخته است.
- **کاهش آتی:** اجرای ماتریس Chrome/Edge با DevTools trace و Fixture واقعی بزرگ.

## نتیجهٔ Release

```yaml
repository_ready: true
build_ready: true
package_validation: passed
reproducibility: passed
browser_runtime_qualification: insufficient_evidence
production_ready_claim_scope: repository_and_build_gates_only
```

نسخهٔ 1.6.11 برای جایگزینی مستقیم سورس و اجرای validation بیرونی آماده است. ادعای production-ready برای Runtime مرورگر واقعی تا اجرای E2E و پروفایل مرورگر محدود می‌ماند.
