# مستندات تست

## راهبرد

تست‌ها در چهار سطح هستند:

1. Unit: Policy، Canonicalization، Validation و utility.
2. Integration: IndexedDB، Capture flow، Package، Source binding و Preflight.
3. Security: forged message، unsafe JSON، payload size، privacy و ZIP traversal.
4. Browser E2E: افزونهٔ واقعی، Service Worker، Side Panel، Download و Runtime.

## وضعیت نسخهٔ 1.6.14

```yaml
unit: 121
security: 11
integration: 86
total: 218
test_files: 57
failed: 0
skipped_pending_todo: 0
```

## تست‌های جدید 1.6.14

- بودجه و توقف واقعی پیمایش TextNode در `tests/integration/performanceCaching.test.ts`.
- index ساختاری ۱۵۰۰ sibling در `tests/unit/identityUniqueness.test.ts`.
- Query گروهی Screenshot، resource ledger، summary projection و maintenance interval در `tests/integration/indexedDb.test.ts`.
- Payload سبک `STATE_GET` در `tests/integration/messageRouter.test.ts`.
- View بدون کپی ZIP در `tests/unit/zip.test.ts`.
- invalidation افزایشی تصاویر در `tests/integration/viewportImageIncremental.test.ts`.

## فرمان‌ها

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run validate:schemas
npm run build
npm run validate
npm run validate:package:external
npm run build:reproducible
npm run validate:store
npm audit
npm audit --omit=dev
```

## Browser E2E

```bash
npm run test:e2e:smoke
npm run test:e2e:chrome
npm run test:e2e:edge
```

Playwright برای Extension به Persistent Context نیاز دارد. Test runner قبل از Suite، Build و محیط side-load را Preflight می‌کند.

## وضعیت اجرای مرورگر در محیط تحویل

```yaml
status: unavailable
code: 2
reason: managed Chromium policy blocks unpacked extensions; Playwright Chromium download was unavailable
```

این وضعیت Pass نیست.

## تست‌های مفقود یا نیازمند محیط بیرونی

- Smoke E2E موفق روی GitHub runner یا Chrome unmanaged.
- Edge E2E واقعی.
- Real Elementor page performance trace.
- Real WordPress/Elementor version matrix.
- Near-limit memory profile برای Snapshot/ZIP.

## رویهٔ بررسی Regression

- هیچ Snapshot یا Schema golden بدون دلیل و review تغییر نکند.
- تغییر Policy باید Matrix test داشته باشد.
- تغییر Package باید External validator و Reproducibility را پاس کند.
- تغییر UI بحرانی باید Smoke E2E یا دلیل `insufficient_evidence` داشته باشد.
