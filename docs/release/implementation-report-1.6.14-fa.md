# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.14

```yaml
نسخه_مبنا: 1.6.13
نسخه_تحویلی: 1.6.14
تاریخ: 2026-06-24
حالت: Engineering Mode
یافته_ثابت_شده: 10
ریسک_بالقوه: 2
fixed: 11
partially_fixed: 1
not_fixed: 0
schema_change: false
permission_change: false
network_change: false
indexeddb_version: 4
```

## خلاصه اجرایی

نسخهٔ 1.6.14 همهٔ یافته‌های ممیزی را بدون بازنویسی معماری و بدون انتقال مسئولیت‌های Python به Browser بررسی و اصلاح کرده است. یازده یافته به‌صورت کامل رفع شده‌اند. ریسک `PERF-P-002` به‌صورت ایمن کاهش یافته، اما چون تعداد کل Session summaryها هنوز Pagination ندارد، وضعیت آن `PARTIALLY_FIXED` ثبت می‌شود.

بهبودهای اصلی:

- bounded شدن پیمایش متن بر اساس عناصر منتخب و بودجهٔ سراسری؛
- تبدیل محاسبهٔ sibling identity از رشد درجه‌دوم به index خطی Capture-scoped؛
- حسابداری تجمعی Snapshot/Screenshot و Fail-fast پیش از Capture و Export؛
- حذف Query ترتیبی Screenshotها و اضافه‌شدن indexهای IndexedDB؛
- کاهش کپی‌های Snapshot، Screenshot، Hash و ZIP؛
- انتقال Maintenance سراسری از مسیر داغ Capture به اجرای فاصله‌دار؛
- پردازش افزایشی Mutation تصاویر؛
- سبک‌شدن پیام `STATE_GET`؛
- حذف Lookupها و Canonicalizationهای تکراری Package Builder.

## نگاشت یافته به اصلاح

### PERF-V-001 — FIXED

- **علت ریشه‌ای:** `TreeWalker` تمام TextNodeهای سند را می‌پیمود و سقف فقط روی دادهٔ ذخیره‌شده اعمال می‌شد.
- **فایل‌ها:** `src/content/collectors/element.ts`, `tests/integration/performanceCaching.test.ts`
- **پیاده‌سازی:** پیمایش فقط روی rootهای منتخب انجام می‌شود؛ سقف سراسری TextNode، نویسه و ancestor step افزوده شده و پس از پرشدن تمام collectionها پیمایش قطع می‌شود. عبور از سقف با `BOUNDED_LIMIT_REACHED` و Diagnostic ثبت می‌شود.
- **اثر مورد انتظار:** هزینه از وابستگی نامحدود به کل سند به کار bounded وابسته به شواهد منتخب تبدیل می‌شود.

### PERF-V-002 — FIXED

- **علت ریشه‌ای:** هر عنصر siblingهای قبلی و مجموعهٔ فرزندان Parent را دوباره اسکن می‌کرد.
- **فایل‌ها:** `src/domain/identity.ts`, `src/content/collectors/element.ts`, `tests/unit/identityUniqueness.test.ts`
- **پیاده‌سازی:** `StructuralOrdinals` و cacheهای `WeakMap/WeakSet` برای هر Capture اضافه شد؛ هر Parent فقط یک‌بار index می‌شود.
- **اثر مورد انتظار:** مسیر sibling از `O(N²)` به `O(N)` تبدیل می‌شود و Array موقت حذف می‌گردد.

### PERF-V-003 — FIXED

- **علت ریشه‌ای:** Chunkها چند بار Encode و Snapshot در چند Buffer کامل مونتاژ می‌شد.
- **فایل‌ها:** `src/background/captureCoordinator.ts`, `src/infrastructure/checksum.ts`, `src/infrastructure/storage/indexedDb.ts`
- **پیاده‌سازی:** طول از metadata جمع می‌شود، هر Chunk فقط یک‌بار Encode و مستقیماً در Buffer نهایی نوشته می‌شود، کپی Hash حذف و Referenceهای Chunk/Buffer پس از مرحلهٔ لازم آزاد می‌شوند. اندازهٔ Canonical واقعی به Commit منتقل می‌شود.
- **اثر مورد انتظار:** حذف یک عبور کامل Encode و چند کپی TypedArray؛ نمایش‌های لازم برای Parse و canonical validation همچنان فقط یک‌بار ساخته می‌شوند.

### PERF-V-004 — FIXED

- **علت ریشه‌ای:** Parser برای هر Entry از `slice` استفاده می‌کرد و پس از ساخت ZIP، Bufferهای Entry هم‌زمان با کپی Parsed نگهداری می‌شدند.
- **فایل‌ها:** `src/infrastructure/zip.ts`, `src/infrastructure/zipReader.ts`, `src/infrastructure/packageBuilder.ts`, `tests/unit/zip.test.ts`
- **پیاده‌سازی:** Parser از `subarray` بدون کپی استفاده می‌کند؛ Entry map پیش از self-validation آرشیو آزاد می‌شود؛ سقف‌های ZIP در Registry مرکزی قرار گرفتند.
- **اثر مورد انتظار:** حذف یک کپی کامل Payload در Parse و کاهش Peak ArrayBuffer از تقریباً سه نسخه به دو نسخهٔ اصلی: Entry payloadها و خروجی ZIP.

### PERF-V-005 — FIXED

- **علت ریشه‌ای:** Session فاقد Ledger تجمعی بود و محدودیت ZIP در مرحلهٔ دیرهنگام اعمال می‌شد.
- **فایل‌ها:** `src/domain/resourceLimits.ts`, `src/background/captureCoordinator.ts`, `src/application/exportUseCase.ts`, `src/infrastructure/storage/indexedDb.ts`, `_locales/*/messages.json`, `src/sidepanel/index.ts`
- **پیاده‌سازی:** metadata تجمعی Snapshot/Screenshot، سقف Capture count و Evidence bytes، کنترل محافظه‌کارانه پیش از Capture و Blocker Preflight/Export افزوده شد. Metadata قدیمی در نخستین استفاده بازسازی می‌شود.
- **اثر مورد انتظار:** Session پیش از عبور از ظرفیت امن متوقف می‌شود و Exportهای از پیش غیرممکن وارد Worker/ZIP assembly نمی‌شوند.

### PERF-V-006 — FIXED

- **علت ریشه‌ای:** برای هر Screenshot یک Transaction مستقل و ترتیبی اجرا می‌شد و این مسیر در Preflight و Export تکرار می‌شد.
- **فایل‌ها:** `src/infrastructure/storage/indexedDb.ts`, `src/application/exportUseCase.ts`, `tests/integration/indexedDb.test.ts`
- **پیاده‌سازی:** index `screenshots.sessionId` و `listScreenshotsBySession` افزوده شد؛ Snapshot و Screenshot به‌صورت موازی و گروهی بارگذاری می‌شوند.
- **اثر مورد انتظار:** حداکثر هزاران Transaction نقطه‌ای به یک Query index‌شده در هر بار بارگذاری Session کاهش می‌یابد.

### PERF-V-007 — FIXED

- **علت ریشه‌ای:** هر Capture یک Maintenance کامل روی تمام Jobها، Chunkها و Metadata اجرا می‌کرد.
- **فایل‌ها:** `src/infrastructure/storage/indexedDb.ts`, `src/background/captureCoordinator.ts`, `src/domain/resourceLimits.ts`, `tests/integration/indexedDb.test.ts`
- **پیاده‌سازی:** `maintainInternalStateIfDue` با timestamp و فاصلهٔ ۱۵ دقیقه اضافه شد؛ Recovery فقط Jobهای فعال را از index `status` می‌خواند.
- **اثر مورد انتظار:** مسیر عادی Capture به تاریخچهٔ کامل Storage وابسته نیست.

### PERF-V-008 — FIXED

- **علت ریشه‌ای:** Screenshot و Hash چند کپی کامل از TypedArray می‌ساختند.
- **فایل‌ها:** `src/background/captureCoordinator.ts`, `src/infrastructure/checksum.ts`
- **پیاده‌سازی:** در صورت پوشش کامل View، همان `ArrayBuffer` ذخیره می‌شود و SHA-256 بدون `Uint8Array.from` غیرضروری اجرا می‌گردد.
- **اثر مورد انتظار:** حذف حداقل دو کپی بایتی در Screenshotهای معمولی.

### PERF-V-009 — FIXED

- **علت ریشه‌ای:** Package Builder برای هر Snapshot/Screenshot از `find`, `some`, `includes` و `filter` خطی استفاده می‌کرد.
- **فایل‌ها:** `src/infrastructure/packageBuilder.ts`
- **پیاده‌سازی:** Map و Setهای snapshot/screenshot/summary یک‌بار ساخته و در تمام validation و coverageها reuse می‌شوند.
- **اثر مورد انتظار:** Lookupهای چندگانه از `O(N²)` به `O(N)` تبدیل می‌شوند.

### PERF-V-010 — FIXED

- **علت ریشه‌ای:** Diagnosticها داخل comparator مرتب‌سازی بارها Canonicalize می‌شدند.
- **فایل‌ها:** `src/infrastructure/packageBuilder.ts`
- **پیاده‌سازی:** Canonical key هر Diagnostic یک‌بار ساخته می‌شود؛ Dedupe و Sort روی همان key انجام می‌گیرد و Aggregate بین Artifactها reuse می‌شود.
- **اثر مورد انتظار:** Canonicalization از مرتبهٔ تقریبی `D log D` به `D` کاهش می‌یابد.

### PERF-P-001 — FIXED

- **علت ریشه‌ای:** هر Mutation مرتبط با class/style/hidden کل `document.images` را dirty و دوباره اسکن می‌کرد.
- **فایل‌ها:** `src/content/readiness/viewportImages.ts`, `tests/integration/viewportImageIncremental.test.ts`
- **پیاده‌سازی:** Candidateها، rootهای visibility و subtreeهای حذف‌شده به‌صورت افزایشی صف می‌شوند؛ Full scan فقط در آغاز Session انجام می‌شود.
- **اثر مورد انتظار:** Mutation یک تصویر یا subtree کوچک باعث Rescan تمام تصاویر صفحه نمی‌شود.

### PERF-P-002 — PARTIALLY FIXED

- **علت ریشه‌ای:** `STATE_GET` تمام Sessionها و تمام Capture summaryهای هر Session را materialize و منتقل می‌کرد؛ تعداد Sessionها سقف نداشت.
- **فایل‌ها:** `src/domain/model.ts`, `src/infrastructure/storage/indexedDb.ts`, `src/background/messageRouter.ts`, `src/popup/index.ts`, `src/sidepanel/index.ts`, `tests/integration/messageRouter.test.ts`, `tests/integration/indexedDb.test.ts`
- **پیاده‌سازی:** `CaptureSessionSummary` سبک اضافه شد؛ `STATE_GET` فقط summaryها و Session انتخاب‌شده را برمی‌گرداند. UI با قرارداد جدید سازگار شد.
- **اثر مورد انتظار:** Capture arrayهای همهٔ Sessionها از Structured Clone و UI state حذف می‌شوند.
- **محدودیت:** تعداد summaryها هنوز Pagination ندارد. افزودن Pagination بدون طراحی UX برای دسترسی به Sessionهای قدیمی می‌توانست داده را عملاً پنهان کند و در این نسخه انجام نشد.

## تغییرات کامل مخزن

### فایل‌های جدید

- `src/domain/resourceLimits.ts`
- `tests/integration/viewportImageIncremental.test.ts`
- `docs/release/1.6.14-release-notes.md`
- `docs/release/test-results-1.6.14.md`
- `docs/release/implementation-report-1.6.14-fa.md`
- `store/chrome/listing/release-notes-1.6.14.md`

### فایل‌های حذف‌شده

- هیچ فایل منبعی حذف نشد.

### فایل‌های اجرایی و آزمون اصلاح‌شده

- `_locales/en/messages.json`
- `_locales/fa/messages.json`
- `src/application/exportUseCase.ts`
- `src/background/captureCoordinator.ts`
- `src/background/messageRouter.ts`
- `src/content/collectors/element.ts`
- `src/content/readiness/viewportImages.ts`
- `src/domain/identity.ts`
- `src/domain/model.ts`
- `src/infrastructure/checksum.ts`
- `src/infrastructure/packageBuilder.ts`
- `src/infrastructure/storage/indexedDb.ts`
- `src/infrastructure/zip.ts`
- `src/infrastructure/zipReader.ts`
- `src/popup/index.ts`
- `src/sidepanel/index.ts`
- `tests/integration/indexedDb.test.ts`
- `tests/integration/messageRouter.test.ts`
- `tests/integration/performanceCaching.test.ts`
- `tests/unit/identityUniqueness.test.ts`
- `tests/unit/schemaVersioning.test.ts`
- `tests/unit/zip.test.ts`

### نسخه، Build و مستندات اصلاح‌شده

- `package.json`
- `package-lock.json`
- `project.config.json`
- `src/manifest/chrome.json`
- `src/manifest/edge.json`
- `CHANGELOG.md`
- `README.md`
- `HELP.md`
- `HELP_FA.md`
- `VALIDATION.txt`
- `src/guide/index.html`
- `docs/architecture.md`
- `docs/compatibility-matrix.md`
- `docs/privacy-model.md`
- `docs/schema-reference.md`
- `docs/handover/ai-context.md`
- `docs/handover/build-and-release.md`
- `docs/handover/project-overview.md`
- `docs/handover/session-recovery.md`
- `docs/handover/testing.md`
- `docs/release/test-results.md`
- `docs/release/unexecuted-browser-tests.md`

## Migration

```yaml
manual_migration_required: false
indexeddb_upgrade: 3_to_4
new_indexes:
  - screenshots.sessionId
  - jobs.status
resource_metadata: rebuilt_on_first_use_for_existing_sessions
public_evidence_schema_migration: none
```

## اعتبارسنجی

نتایج قطعی در `docs/release/test-results-1.6.14.md` ثبت شده‌اند:

- TypeScript، ESLint، Stylelint و Prettier: موفق
- ۲۰۵ آزمون از ۲۰۵ آزمون در ۵۶ فایل: موفق
- ۲۰ Schema و ۱۹ شناسهٔ یکتا: موفق
- Build و Package validation برای Chrome و Edge: موفق
- External Package Validation: چهار از چهار موفق
- Reproducible Build: ۱۰۲ فایل بدون مغایرت
- Store/manual validation: ۲۷ سند موفق
- Production dependency audit: صفر آسیب‌پذیری
- Browser smoke E2E: `insufficient_evidence` به‌علت نبود executable قابل‌استفاده

## ریسک‌های باقی‌مانده

### R-1 — Buffer پیوستهٔ ZIP32

- **دلیل:** API دانلود فعلی یک Blob/Buffer نهایی می‌خواهد و Writer دترمینیستیک Store-only یک خروجی پیوسته می‌سازد.
- **اثر بالقوه:** Export نزدیک سقف همچنان به Payload Entryها به‌علاوه یک Buffer خروجی نیاز دارد.
- **کاهش فعلی:** Parser بدون کپی، آزادسازی Entry map، Worker، سقف ۲۵۶ MB و بودجهٔ تجمعی ۲۲۰ MB.
- **آینده:** بررسی Stream-to-download فقط با قرارداد نسخه‌بندی‌شده و آزمون Reproducibility.

### R-2 — Pagination تاریخچه Session

- **دلیل:** این نسخه Payload را سبک کرده، اما طراحی Paging و UX بازیابی Sessionهای قدیمی نیازمند تغییر قرارداد UI داخلی است.
- **اثر بالقوه:** در تاریخچه‌های بسیار طولانی، فهرست Summaryها همچنان خطی رشد می‌کند.
- **آینده:** Cursor-based paging با انتخاب پایدار و ابزار Archive/Delete batch.

### R-3 — صلاحیت Runtime مرورگر

- **دلیل:** Chrome/Playwright executable در محیط فعلی موجود نبود.
- **اثر بالقوه:** رفتار واقعی Memory/CPU مرورگر پس از Capture و Exportهای متوالی در این محیط اندازه‌گیری نشده است.
- **آینده:** اجرای `npm run release:gate:chrome` و `npm run release:gate:edge` در Runner مجاز به Load Unpacked و ثبت Trace/Heap/CPU artifacts.
