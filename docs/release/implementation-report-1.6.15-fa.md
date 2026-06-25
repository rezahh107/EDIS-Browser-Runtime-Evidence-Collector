# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.15

```yaml
نسخه_مبنا: 1.6.14
نسخه_تحویلی: 1.6.15
تاریخ: 2026-06-25
حالت: Engineering Mode
requirements_fixed: 4
requirements_implemented_but_runtime_validation_blocked: 1
requirements_not_fixed: 0
schema_change: false
permission_change: false
network_change: false
indexeddb_version: 4
```

## خلاصه اجرایی

نسخهٔ 1.6.15 موارد تأییدشدهٔ بررسی پس از 1.6.14 را با تغییرات هدفمند پیاده‌سازی می‌کند. زنجیرهٔ Browser Qualification دیگر به `/usr/bin/chromium` یا Browser ناشناخته تکیه نمی‌کند؛ Canonicalization در برابر cycle و ورودی‌های بیش‌ازحد عمیق یا بزرگ خطای دترمینیستیک می‌دهد؛ و رکوردهای Chunk قدیمی فاقد SHA-256 فقط تحت checksum کامل Snapshot پذیرفته می‌شوند.

تست‌های موجود Service Worker termination/recovery حذف یا تکرار نشده‌اند. اجرای واقعی آن‌ها تلاش شد، اما Policy مدیریت‌شدهٔ Chromium نصب unpacked extension را مسدود کرد. دانلود Runtime Playwright Chromium نیز به‌علت `EAI_AGAIN` ممکن نشد. در نتیجه وضعیت Runtime مرورگر صادقانه `insufficient_evidence` باقی می‌ماند.

## نگاشت requirement به اصلاح

### BQ-001 — FIXED — حذف hard-code و اتصال Qualification به Evidence واقعی

- **علت ریشه‌ای:** Aggregator نسخهٔ Browser را مستقلاً از `/usr/bin/chromium` می‌خواند و می‌توانست با Runtime اجراشده متفاوت باشد.
- **فایل‌ها:** `scripts/e2e-environment.mjs`, `scripts/run-e2e.mjs`, `scripts/aggregate-browser-qualification.mjs`, `scripts/release-gate.mjs`, `scripts/release-evidence.mjs`, `scripts/audit-personal-release-evidence.mjs`
- **پیاده‌سازی:** executable resolver اکنون path/source/family/version/SHA-256 را ثبت می‌کند. Build directory، Manifest، Extension ID و Service Worker URL نیز hash و اعتبارسنجی می‌شوند. Aggregator محیط هر shard را به گزارش همان shard متصل و Runtime identity را بین shardها تطبیق می‌دهد.
- **قاعده fail-closed:** `PASS` با Browser ناشناخته، digest ناقص، Worker URL ناسازگار، Scope متعارض یا report بدون environment ممنوع است.
- **اثر:** Evidence مرورگر قابل انتساب به Artifact و Runtime واقعی است و گزارش qualification دیگر نمی‌تواند Browser دیگری را به‌صورت ضمنی نمایندگی کند.

### BQ-002 — IMPLEMENTED / RUNTIME VALIDATION BLOCKED

- **نیاز:** اجرای تست‌های موجود Service Worker lifecycle و نگهداری Evidence واقعی.
- **وضعیت کد:** تست‌های موجود در `tests/e2e/resilience.spec.ts` حفظ شده‌اند؛ Release Gate پس از Suite کامل Aggregator را اجرا می‌کند.
- **تلاش اجرا:** System Chromium شناسایی و hash شد، اما `ExtensionInstallBlocklist=["*"]` Load Unpacked را مسدود کرد. نصب Playwright Chromium نیز با خطای DNS `EAI_AGAIN` شکست خورد.
- **نتیجه:** شکست Product test مشاهده نشد؛ Suite شروع نشد. وضعیت `insufficient_evidence` است.

### DET-001 — FIXED — Canonical cycle/depth/node/collection guard

- **علت ریشه‌ای:** Recursive canonicalization فاقد cycle detection و بودجهٔ محاسباتی صریح بود و می‌توانست با `RangeError` محیطی متوقف شود.
- **فایل‌ها:** `src/domain/canonical.ts`, `tests/unit/canonical.test.ts`, `docs/determinism.md`
- **پیاده‌سازی:** `WeakSet` فقط ancestorهای فعال را نگه می‌دارد؛ repeated reference غیرچرخه‌ای مجاز است. سقف‌ها:
  - depth: `128`
  - visited nodes: `1,000,000`
  - entries per array/object: `100,000`
- **خطاها:** `CanonicalizationError extends TypeError` با codeهای ثابت مانند `EDIS_CANONICAL_CYCLE`, `EDIS_CANONICAL_DEPTH_LIMIT`, `EDIS_CANONICAL_NODE_LIMIT` و `EDIS_CANONICAL_COLLECTION_LIMIT`.
- **رفتار ممنوع:** هیچ ورودی ناسالمی به sentinel string تبدیل نمی‌شود.

### LEG-001 — FIXED — Legacy chunk integrity

- **علت ریشه‌ای:** رکوردهای قدیمی بدون hash یا با zero hash می‌توانستند per-chunk verification را رد کنند.
- **فایل‌ها:** `src/infrastructure/storage/indexedDb.ts`, `src/background/captureCoordinator.ts`, `tests/integration/captureRecoveryFlow.test.ts`, `tests/integration/indexedDb.test.ts`
- **پیاده‌سازی:** تمام Chunkهای جدید SHA-256 واقعی دارند. رکوردهای قدیمی به state داخلی `LEGACY_UNVERIFIED` normalize می‌شوند.
- **سیاست:**
  - Complete message با checksum کامل معتبر: Snapshot پذیرفته می‌شود و Diagnostic عملیاتی warning ثبت می‌گردد.
  - Recovery پس از Restart بدون checksum کامل Producer: fail-closed با `EDIS_RUNTIME_CORRUPT_STORED_SNAPSHOT`.
- **اثر:** Compatibility قدیمی حفظ می‌شود، اما bypass خاموش integrity حذف شده است.

### VER-001 — FIXED — Migration، stress و release regression coverage

- **فایل‌ها:** `tests/integration/browserQualificationAudit.test.ts`, `tests/integration/indexedDb.test.ts`, `tests/integration/captureRecoveryFlow.test.ts`, `tests/unit/canonical.test.ts`, `scripts/run-repository-tests.mjs`
- **پوشش:** Browser provenance ناقص، محیط unavailable، cycle مستقیم/غیرمستقیم، boundary depth/collection/node، unsupported values، Unicode خراب، migration واقعی v3→v4، legacy checksum compatibility و fail-closed recovery.
- **Runner:** اجرای Repository tests تک‌Worker و non-detached شده تا Evidence در محیط‌های محدود پایدار و قابل جمع‌آوری باشد.

## تغییرات کامل مخزن

### فایل‌های اصلاح‌شده

- `CHANGELOG.md`
- `HELP.md`
- `HELP_FA.md`
- `README.md`
- `VALIDATION.txt`
- `docs/determinism.md`
- `docs/handover/ai-context.md`
- `docs/handover/build-and-release.md`
- `docs/handover/known-limitations.md`
- `docs/handover/project-overview.md`
- `docs/handover/session-recovery.md`
- `docs/handover/testing.md`
- `docs/release/unexecuted-browser-tests.md`
- `package.json`
- `package-lock.json`
- `project.config.json`
- `scripts/aggregate-browser-qualification.mjs`
- `scripts/audit-personal-release-evidence.mjs`
- `scripts/e2e-environment.mjs`
- `scripts/release-evidence.mjs`
- `scripts/release-gate.mjs`
- `scripts/run-e2e.mjs`
- `scripts/run-repository-tests.mjs`
- `src/background/captureCoordinator.ts`
- `src/domain/canonical.ts`
- `src/domain/model.ts`
- `src/guide/index.html`
- `src/infrastructure/storage/indexedDb.ts`
- `src/manifest/chrome.json`
- `src/manifest/edge.json`
- `tests/integration/captureRecoveryFlow.test.ts`
- `tests/integration/indexedDb.test.ts`
- `tests/unit/canonical.test.ts`
- `tests/unit/schemaVersioning.test.ts`

### فایل‌های جدید

- `docs/release/1.6.15-release-notes.md`
- `docs/release/contract-delta-1.6.15.md`
- `docs/release/implementation-report-1.6.15-fa.md`
- `docs/release/test-results-1.6.15.md`
- `store/chrome/listing/release-notes-1.6.15.md`
- `tests/integration/browserQualificationAudit.test.ts`

### فایل‌های حذف‌شده

- هیچ فایل منبعی حذف نشد.

## Migration

```yaml
manual_migration_required: false
indexeddb_version: 4
new_database_schema_change_in_1_6_15: false
migration_test_added: v3_to_v4_preserves_records_and_adds_indexes
public_evidence_schema_migration: none
```

## محدودیت‌های باقی‌مانده

1. **Browser runtime qualification:** محیط فعلی Load Unpacked را مسدود می‌کند؛ exact Chrome و exact Edge اجرا نشده‌اند.
2. **Legacy recovery:** بدون checksum کامل Snapshot، Chunk قدیمی فاقد hash عمداً قابل بازیابی نیست. این رفتار fail-closed طراحی‌شده است.
3. **ZIP32 و Session pagination:** محدودیت‌های واقعی ثبت‌شدهٔ 1.6.14 بدون تغییر باقی مانده‌اند.
