# گزارش پیاده‌سازی EDIS Runtime Collector 1.6.18

## خلاصه

نسخه `1.6.18` روی رفع defect تأییدشده‌ی browser qualification aggregator متمرکز است. در نسخه قبلی، suite واقعی Playwright شامل ۳۲ تست بود اما aggregator هنوز انتظار hard-coded برابر ۲۹ تست داشت. این نسخه contract را متمرکز کرد و release gate را از حالت تک‌مرورگری به gate کامل دو-target اصلاح کرد.

## تغییرات اصلی

| حوزه | تغییر |
|---|---|
| Versioning | `1.6.17` به `1.6.18` در `package.json`, `package-lock.json`, `project.config.json`, `src/manifest/chrome.json`, `src/manifest/edge.json` |
| Browser aggregator | حذف فرض `unique.size !== 29` و جایگزینی با `tests/e2e/browser-qualification-contract.json` |
| Suite contract | ثبت contract فعلی: ۳۲ تست در ۶ فایل، برای هر target |
| Regression tests | اضافه شدن `tests/integration/browserQualificationAggregator.test.ts` |
| Full gate | `release:gate` اکنون `--browser all` است و هر دو target را لازم می‌داند |
| Human evidence | Markdown release evidence همان محدودیت‌های JSON را نشان می‌دهد |
| Export retry | `exportWorkerClient` قبل از transfer از screenshot ArrayBuffer کپی می‌گیرد |

## وضعیت runtime evidence

Chrome Stable و Microsoft Edge Stable در محیط اجرا موجود نبودند. بنابراین:

- `exact_chrome_qualified = false`
- `exact_edge_qualified = false`
- `browserTestsExecuted = 0`
- `browser qualification status = INSUFFICIENT_EVIDENCE`
- `release finalDecision = NOT_READY`

هیچ runtime evidence جعلی، browser version جعلی، extension ID جعلی یا exported package hash جعلی تولید نشده است.
