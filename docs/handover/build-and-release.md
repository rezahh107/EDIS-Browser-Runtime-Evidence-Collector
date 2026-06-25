# ساخت و انتشار

## پیش‌نیازها

- Node.js 20 یا جدیدتر.
- npm همراه Node.
- برای E2E: Chromium بستهٔ Playwright یا Chrome/Edge سازگار با Load Unpacked.
- Linux CI برای حالت headed از Xvfb استفاده می‌کند.

## نصب وابستگی‌ها

```bash
npm ci
```

Lockfile بخشی از Source of Truth است. از Update تصادفی Dependency خودداری شود.

## Build

```bash
npm run build
npm run build:chrome
npm run build:edge
```

خروجی:

```text
dist/chrome/
dist/edge/
```

پوشهٔ انتخاب‌شده برای Load Unpacked باید `manifest.json` را مستقیماً در Root داشته باشد.

## Gate بدون مرورگر

```bash
npm run release:gate:no-browser
```

این Gate از پوشهٔ Evidence پاک شروع می‌شود و شامل Workflow pin policy، Typecheck، Lint، Format، اجرای واقعی Repository tests، Schema validation، Build، Package validation داخلی و خارجی، Reproducibility، Source package، Source-to-shipped provenance، Store docs و Production audit است.

## E2E Smoke

```bash
npm run build:chrome
npm run test:e2e:smoke
```

Environment متداول:

```bash
EDIS_CHROME_EXECUTABLE_PATH=/path/to/chromium \
EDIS_E2E_HEADLESS=false \
EDIS_E2E_CAPTURE_MEDIA=true \
npm run test:e2e:smoke
```

در Linux headed:

```bash
xvfb-run --auto-servernum npm run test:e2e:smoke
```

## Full Browser Gate

```bash
npm run release:gate:chrome
npm run release:gate:edge
```

نتیجهٔ `UNAVAILABLE` برابر Pass نیست.

## ساخت ZIP مرورگر

برای ساخت نهایی همراه با Source و Provenance:

```bash
npm run package:release:verified
```

برای ساخت صرفاً ZIPهای مرورگر پس از Build:

```bash
node scripts/package-release.mjs
```

خروجی در `artifacts/packages/` قرار می‌گیرد.

## Source manifest

```bash
npm run manifest:source
```

این فرمان `GENERATION_MANIFEST.json` را با SHA-256 تمام فایل‌های Source غیرمستثنی تولید می‌کند.

## فرآیند Release پیشنهادی

1. نسخه‌ها در `package.json`، `project.config.json`، Domain model و Manifestها یکسان شوند.
2. Changelog و release notes اضافه شوند.
3. `npm ci`.
4. `npm run release:gate:no-browser`.
5. Smoke E2E روی Chrome unmanaged.
6. Full E2E یا Manual qualification.
7. `npm run package:release:verified`.
8. `artifacts/release-provenance/release-provenance.json` بررسی شود.
9. SHA-256 artifactها تولید شود.
10. Tag فقط بعد از بررسی reportها و Evidence مرورگر ایجاد شود.

## Rollback

- ZIP نسخهٔ قبلی و SHA-256 آن نگه‌داری شود.
- IndexedDB نسخهٔ 4 در 1.6.15 به‌صورت خودکار indexهای `screenshots.sessionId` و `jobs.status` را ایجاد می‌کند؛ metadata حسابداری Session در نخستین استفاده بازسازی می‌شود و مهاجرت دستی لازم نیست.
- برای Rollback افزونه، Build قبلی Load Unpacked شود؛ Evidence packageها مستقل و Versioned هستند.
