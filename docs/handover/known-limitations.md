# محدودیت‌های شناخته‌شده

## ۱. صلاحیت Runtime مرورگر

```yaml
status: insufficient_evidence
system_chromium: blocked_by_managed_ExtensionInstallBlocklist
playwright_chromium_download: unavailable_EAI_AGAIN
exact_chrome: not_executed
exact_edge: not_executed
```

کد و ۲۹ آزمون E2E موجودند، اما اجرای مسدودشده به‌عنوان Pass گزارش نمی‌شود.

## ۲. ماتریس واقعی WordPress/Elementor

Fixtureهای کنترل‌شده وجود دارند؛ ماتریس واقعی نسخه‌های WordPress، Elementor V3/V4، Multisite، Theme و logged-in/out کامل نیست.

## ۳. انتقال Snapshot

مسیر 1.6.14 کپی‌ها را کاهش داده است، اما Transport Chunk همچنان رشته‌ای است و Parse/Canonical validation به String و Object نیاز دارد. تغییر به binary transferable فقط پس از contract review و Browser E2E مجاز است.

## ۴. ZIP32

ZIP خروجی Store-only و دترمینیستیک است و همچنان Buffer نهایی پیوسته می‌سازد. بودجهٔ Session و Package ریسک را محدود می‌کند ولی streaming download پیاده‌سازی نشده است.

## ۵. Session summary pagination

`STATE_GET` فقط Summary سبک Sessionها و جزئیات Session انتخاب‌شده را منتقل می‌کند، اما تعداد Summaryها هنوز Pagination ندارد.

## ۶. CSSOM origin و Correlation

Collector فقط Computed Style و binding اولیه را ثبت می‌کند. Resolution و Correlation نهایی Python-owned است.

## ۷. iframe و Shadow DOM

Descendantهای iframe و shadow root پیمایش نمی‌شوند؛ فقط شواهد محیطی مربوط ثبت می‌شود.

## ۸. Legacy chunk compatibility

Chunk legacy فاقد hash فقط وقتی قابل Commit است که checksum کامل Snapshot از Producer موجود و معتبر باشد. Recovery پس از Restart بدون آن checksum عمداً fail-closed است.
