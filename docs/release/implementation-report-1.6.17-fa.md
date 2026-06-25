# گزارش پیاده‌سازی 1.6.17 — EDIS Runtime Collector

## تصمیم انتشار

`NO_GO` برای انتشار store/runtime qualification، چون اجرای دقیق روی Google Chrome Stable و Microsoft Edge Stable در محیط حاضر انجام نشد. کد gate اصلاح شده و دیگر بدون اجرای مرورگر دقیق PASS نمی‌دهد.

## تغییرات اصلی

- نسخه پروژه، package و manifestها از `1.6.16` به `1.6.17` افزایش یافت.
- `source_entry_count` و hashهای release evidence از ZIPهای واقعی محاسبه می‌شوند.
- browser qualification از `dist/<target>` به exact packaged ZIP استخراج‌شده تغییر کرد.
- fallback خودکار به Playwright Chromium برای Chrome/Edge دقیق حذف شد، مگر با `EDIS_E2E_ALLOW_CHROMIUM_FALLBACK=true` که برای qualification دقیق قابل قبول نیست.
- response envelope validation به UI/content اضافه شد.
- diagnostic failure boundary و privacy redaction تقویت شد.
- IndexedDB summary projection در حضور یک رکورد corrupt همچنان sessionهای معتبر را actionable نگه می‌دارد و boundary جداگانه گزارش می‌کند.
- تست‌های storage corruption/legacy/partial، snapshot/screenshot size، document binding/navigation/restricted page و service-worker recovery اضافه شد.

## عدم تغییر عمدی

- `host_permissions` اضافه نشد.
- permissions موجود تغییر نکرد.
- IndexedDB version روی `4` باقی ماند.
- Runtime Snapshot schema روی `1.6.0` باقی ماند.
- evidence/package schema contract تغییر داده نشد.
- multi-frame capture اضافه نشد.
