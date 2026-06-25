# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.16

```yaml
نسخه_مبنا: 1.6.15
نسخه_تحویلی: 1.6.16
نوع_انتشار: release_integrity_and_clean_gate
schema_change: false
permission_change: false
network_change: false
manual_migration: false
```

## خلاصه اجرایی

این نسخه ایرادهای Release Integrity نسخهٔ 1.6.15 را بدون تغییر رفتار شواهد Runtime برطرف می‌کند. Release Gate دیگر یک JSON قدیمی را به‌جای اجرای تست‌ها نمی‌خواند؛ Evidence قبلی را حذف می‌کند و سه مرحلهٔ آماده‌سازی، اجرای واقعی Vitest و اعتبارسنجی گزارش را به‌ترتیب اجرا می‌کند. Source ZIP و Buildهای Chrome/Edge از یک Source state نهایی تولید می‌شوند و Gate مستقل، Build مجدد از Source ZIP را بایت‌به‌بایت با Artifact تحویلی مقایسه می‌کند.

## نگاشت یافته‌ها

| Finding | وضعیت | پیاده‌سازی |
|---|---|---|
| `RC-1` Source/Build mismatch | `FIXED` | Source package دترمینیستیک و Gate بازسازی Source-to-shipped اضافه شد؛ هر دو Target باید byte-identical باشند. |
| `RC-2` stale release test report | `FIXED` | Release Gate پوشهٔ Evidence را پاک و Test prepare/run/verify را واقعاً اجرا می‌کند. |
| `SC-1` rolling GitHub Actions | `FIXED` | همهٔ ۱۲ Reference به SHA چهل‌کاراکتری Pin و Policy validator اضافه شد. |
| `DOC-1` stale schema reference | `FIXED` | Package version از Schema baseline جدا و نسخهٔ جاری 1.6.16 ثبت شد. |
| `RT-1` exact browser runtime | `PARTIALLY_FIXED` | Runner/Evidence آماده است؛ اجرای واقعی در این محیط به‌علت Policy و نبود Runtime قابل دریافت مسدود ماند و `insufficient_evidence` است. |
| `PR-1` Store readiness | `NOT_CLAIMED` | Store document gate حفظ شد، اما Store-ready اعلام نمی‌شود. |
| `PR-2` independent full tests | `FIXED` | Clean Gate مستقل 222 آزمون را از ابتدا اجرا کرد. |
| `PR-3` real WordPress/Elementor matrix | `INSUFFICIENT_EVIDENCE` | Fixture مصنوعی حفظ شد؛ دادهٔ واقعی جدید ایجاد یا جعل نشد. |

## تغییرات اجرایی

### Release Gate

- حذف کامل `artifacts/release-gate` در شروع.
- اجرای `prepare-repository-tests.mjs`، سپس `run-repository-tests.mjs`، سپس `run-test-gate.mjs`.
- Timeout مستقل 300 ثانیه‌ای برای Test و Reproducibility/Provenance.
- Heartbeat قابل مشاهده برای Test runner طولانی.
- افزودن External Package Validation، Workflow pin validation، Source manifest/package و Release provenance.

### Artifact provenance

- `package-source.mjs` Source ZIP را فقط از فایل‌های ثبت‌شده در `GENERATION_MANIFEST.json` می‌سازد و Hash/Length هر ورودی را بررسی می‌کند.
- `verify-release-provenance.mjs` Source ZIP را با Path validation استخراج می‌کند، Chrome و Edge را از آن Build و Package می‌کند و SHA-256 و طول بایت را با Artifact تحویلی مقایسه می‌کند.
- هر تفاوت، Gate را Fail می‌کند.

### Supply chain

- `actions/checkout` به SHA نسخهٔ 4.2.2 Pin شد.
- `actions/setup-node` به SHA نسخهٔ 4.4.0 Pin شد.
- `actions/upload-artifact` به SHA نسخهٔ 4.6.2 Pin شد.
- Validator هر Action خارجی غیرمحلی را فقط با Full SHA می‌پذیرد.
- Dependabot برای GitHub Actions و npm به‌صورت هفتگی پیکربندی شد.

## فایل‌های اصلاح‌شده

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `CHANGELOG.md`
- `GENERATION_MANIFEST.json`
- `HELP.md`
- `HELP_FA.md`
- `README.md`
- `VALIDATION.txt`
- `docs/handover/build-and-release.md`
- `docs/handover/project-overview.md`
- `docs/handover/session-recovery.md`
- `docs/release/test-results.md`
- `docs/release/unexecuted-browser-tests.md`
- `docs/schema-reference.md`
- `package-lock.json`
- `package.json`
- `project.config.json`
- `scripts/release-evidence.mjs`
- `scripts/release-gate.mjs`
- `scripts/run-repository-tests.mjs`
- `src/domain/model.ts`
- `src/guide/index.html`
- `src/manifest/chrome.json`
- `src/manifest/edge.json`
- `tests/unit/schemaVersioning.test.ts`

## فایل‌های جدید

- `.github/dependabot.yml`
- `docs/release/1.6.16-release-notes.md`
- `docs/release/contract-delta-1.6.16.md`
- `docs/release/implementation-report-1.6.16-fa.md`
- `docs/release/test-results-1.6.16.md`
- `scripts/package-source.mjs`
- `scripts/validate-workflow-actions.mjs`
- `scripts/verify-release-provenance.mjs`
- `store/chrome/listing/release-notes-1.6.16.md`
- `tests/integration/releaseGateExecution.test.ts`
- `tests/integration/workflowActionPinning.test.ts`

فایل حذف‌شده‌ای وجود ندارد.

## نتیجه اعتبارسنجی

```yaml
clean_no_browser_gate: passed
repository_tests: 222_of_222_passed
schema_validation: passed
build_validation: passed
external_package_validation: 4_of_4_passed
reproducible_build: passed
source_to_chrome_byte_identity: passed
source_to_edge_byte_identity: passed
production_dependency_audit: zero_vulnerabilities
browser_runtime: insufficient_evidence
```

## محدودیت باقی‌مانده

تنها محدودیت اصلی، نبود Evidence اجرای واقعی Extension در Runtime مجاز به Load Unpacked است. این محدودیت با تغییر عبارت گزارش به `PASS` پنهان نشده است. Exact Google Chrome، Exact Microsoft Edge، Store submission و Matrix واقعی WordPress/Elementor همچنان نیازمند اجرای بیرونی و Artifact واقعی هستند.
