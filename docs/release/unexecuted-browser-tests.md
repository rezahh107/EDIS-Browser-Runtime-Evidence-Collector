# وضعیت صلاحیت مرورگر — نسخه 1.6.16

## آزمون‌های هنجاری موجود

Suite مرورگر شامل ۲۹ آزمون در ۶ فایل است. دو آزمون موجود زیر مستقیماً lifecycle سرویس‌ورکر را پوشش می‌دهند و در این نسخه تست جایگزین یا مصنوعی دیگری به‌جای آن‌ها افزوده نشده است:

- `idle service-worker termination preserves persisted sessions`
- `real worker termination during capture ends in a recoverable state`

## تلاش اجرایی این محیط

```yaml
status: insufficient_evidence
requested_target: chrome
actual_browser_family: null
executable: null
exit_code: 2
reason: no_usable_chrome_executable_and_playwright_chromium_absent
```

Runner فایل‌های `environment-unavailable.json` و `environment-unavailable.txt` را تولید کرد. هیچ Browser test آغاز نشد و هیچ نتیجهٔ `PASS` یا Product failure صادر نشده است.

## تفکیک ادعاها

- اجرای Playwright Chromium فقط `AUTOMATED_PLAYWRIGHT_CHROMIUM` را qualify می‌کند.
- Google Chrome دقیق نیازمند Evidence مستقل `EXACT_GOOGLE_CHROME` است.
- Microsoft Edge دقیق نیازمند Evidence مستقل `EXACT_MICROSOFT_EDGE` است.
- Aggregator با Browser ناشناخته یا provenance ناقص fail می‌شود.

## اجرای بیرونی توصیه‌شده

```text
npm ci
npx playwright install --with-deps chromium
npm run build
EDIS_E2E_ARTIFACT_DIR=artifacts/browser-e2e npm run test:e2e:chrome
node scripts/aggregate-browser-qualification.mjs artifacts/browser-e2e
```

برای ادعای exact-product، executable رسمی همان محصول را از طریق `EDIS_CHROME_EXECUTABLE_PATH` یا `EDIS_EDGE_EXECUTABLE_PATH` ارائه و Evidence جداگانه نگهداری کنید.
