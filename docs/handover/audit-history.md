# تاریخچهٔ ممیزی و اصلاحات

## ممیزی Performance نسخهٔ 1.6.10

گزارش مرجع: `docs/release/implementation-report-1.6.11-fa.md` و نسخهٔ اصلی در Handover reports.

### یافته‌ها

- تکرار `getComputedStyle` و Geometry/Visibility.
- بازسازی Identity index.
- اسکن Source binding برای هر عنصر.
- Text Shape allocationهای تکراری.
- Readiness image polling پرهزینه.
- Snapshot duplication.
- CRC و ZIP روی UI thread.
- Hash/validation passهای تکراری.
- IndexedDB `getAll()` pressure.
- Polling ثابت.

### اصلاح نسخهٔ 1.6.11

- ۸ مورد `FIXED`.
- `PERF-006` و `RISK-002` با Mitigation محافظه‌کارانه.
- Capture context، immutable indexes، Export Worker، table CRC، cursor maintenance و adaptive polling اضافه شد.

## ممیزی Export Blocking نسخهٔ 1.6.11

گزارش مرجع: `EDIS-1.6.11-Export-Blocking-Audit-FA.md` در Handover.

### یافته‌ها

- نبود Runtime Evidence fallback برای Minimum Session ناقص.
- مخلوط‌شدن Warning و Blocker در UI.
- نبود تست مسیر واقعی Dialog/Download.
- انتخاب پیش‌فرض Workflow سخت‌گیرانه.

### اصلاح نسخهٔ 1.6.12

- One-way fallback.
- جداسازی Blocker/Warning.
- Runtime Evidence به‌عنوان Default.
- Unit/Integration/E2E source coverage.

## بازبینی پس از 1.6.12

### یافتهٔ تأییدشده

`workflow_mode: null` به‌اشتباه Minimum Python Feed را در policy مجاز می‌کرد.

### یافته‌های جزئی/Hardening

- Fallback domain function برای modeهای غیر Minimum خودبسنده نبود.
- مسیر E2E بحرانی فقط هفتگی اجرا می‌شد.
- README نسخهٔ Performance release و test count قدیمی داشت.

### موارد ردشده با شواهد

- Playwright error context فایل اشتباه را نشان نمی‌داد؛ failure frame در Harness صحیح بود.
- Performance fixes 1.6.10 رها نشده بودند؛ در 1.6.11 پیاده شده‌اند.

## اصلاح نسخهٔ 1.6.13

- Null mode fail-closed در Export.
- Legacy captured session Runtime-only در Capture و UI.
- Defensive fallback policy.
- ۶ تست Repository جدید؛ مجموع ۱۹۸.
- Chromium Smoke E2E در Push/PR.
- اصلاح README و release documentation.
- رفع Advisory وابستگی انتقالی توسعه.

## وضعیت باقی‌مانده

```yaml
verified_open_bugs: 0
remaining_runtime_qualification_gaps:
  - unmanaged Chrome E2E execution
  - Edge E2E execution
  - real WordPress/Elementor compatibility matrix
remaining_performance_risks:
  - string-based snapshot transport peak memory
  - adaptive polling not replaced by push
```
