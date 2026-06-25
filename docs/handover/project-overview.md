# نمای کلی پروژه

## مشخصات

```yaml
project: EDIS Browser Runtime Evidence Collector
current_version: 1.6.16
development_status: implemented_and_no_browser_gates_passed
browser_runtime_status: insufficient_evidence_in_current_environment
release_date: 2026-06-25
license: MIT
```

## هدف پروژه

این مخزن افزونهٔ محلی Manifest V3 برای جمع‌آوری شواهد Runtime صفحهٔ وب در خط لولهٔ EDIS است. افزونه فقط پس از اقدام صریح کاربر، DOM رندرشده، Geometry، Computed Styleهای مجاز، روابط، Readiness، وضعیت محیط Capture و شواهد اولیهٔ اتصال Source/Runtime را ثبت می‌کند و یک ZIP دترمینیستیک محلی می‌سازد.

این محصول تحلیل نهایی انجام نمی‌دهد. Resolution، Formula، Rule، Score، Correlation نهایی و TruthReport متعلق به Python Deterministic Engine هستند.

## قابلیت‌های اصلی

- Capture محدود و نسخه‌بندی‌شدهٔ Runtime Snapshot.
- Sessionهای چند Observation با ترتیب و شناسهٔ دترمینیستیک.
- دو Workflow: `RUNTIME_EVIDENCE` و `MINIMUM_PYTHON_FEED`.
- Import محلی و اختیاری `bridge/source-context.json` از WordPress Evidence Exporter.
- Readiness دترمینیستیک برای Minimum Python Feed.
- Source binding اولیه بدون انجام Correlation نهایی.
- Export ZIP با Canonical JSON، SHA-256 inventory و اعتبارسنجی داخلی.
- Chrome و Edge Build مستقل با Manifest V3.
- ذخیره‌سازی محلی در IndexedDB و `chrome.storage`.
- Export Worker برای انتقال کار Hash/Validation/ZIP از UI thread.
- Cacheهای محدود به Capture برای کاهش DOM traversal و `getComputedStyle`.
- UI فارسی و انگلیسی.

## وضعیت نسخهٔ 1.6.16

این نسخه Release Integrity و Clean Gate را اصلاح می‌کند:

1. Gate از Evidence قبلی پاک می‌شود و  Test prepare، اجرای واقعی Vitest و Test verification را به‌ترتیب انجام می‌دهد.
2. تمام GitHub Actions خارجی فقط با Full Commit SHA پذیرفته می‌شوند.
3. Source ZIP از `GENERATION_MANIFEST.json` به‌صورت دترمینیستیک ساخته می‌شود.
4. Chrome و Edge از Source ZIP بازسازی و با ZIPهای تحویلی بایت‌به‌بایت مقایسه می‌شوند.
5. مستند Package version از Schema version ثابت جدا شده است.

Schemaهای شواهد، Package pathها، Permissionها و مرزهای Frozen Contract تغییر نکرده‌اند. IndexedDB همچنان نسخهٔ 4 است و مهاجرت دستی لازم نیست.

## فناوری‌ها

- TypeScript با Strict Mode.
- Manifest V3 و Chrome Extension APIs.
- esbuild برای Bundle.
- IndexedDB برای Sessions، Jobs، Chunks، Snapshots و Screenshotها.
- Vitest برای Unit، Integration و Security tests.
- Playwright برای E2E افزونه.
- ESLint، Stylelint و Prettier.
- JSON Schemaهای نسخه‌بندی‌شده.
- Node.js 20 یا جدیدتر برای توسعه و Build.

## پلتفرم‌های پشتیبانی‌شده

- Google Chrome با حداقل نسخهٔ Manifest برابر `116` طبق Manifest Chrome.
- Microsoft Edge مبتنی بر Chromium.
- نصب اصلی پروژه در وضعیت فعلی: `Load unpacked`.
- Firefox در این مخزن Target تولیدی نیست.

## فایل‌های شروع مهم

- `README.md`
- `HELP_FA.md`
- `docs/contracts/EDIS-Cross-Product-Contract-Freeze-v1.0.0.md`
- `docs/handover/ai-context.md`
- `docs/handover/session-recovery.md`
- `docs/release/1.6.16-release-notes.md`
- `docs/release/test-results-1.6.16.md`
