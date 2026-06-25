# راهنمای بازیابی Session توسعه

## وضعیت فعلی

```yaml
current_version: 1.6.14
last_completed_milestone: export_provenance_and_ci_hardening
source_state: complete
no_browser_quality_gate: passed
repository_tests: 218_passed
browser_smoke_local: unavailable
uncommitted_intent: none
```

## آخرین تغییرات

- Null workflow برای Minimum Feed بسته شد.
- Session Legacy دارای Capture Runtime-only شد.
- Fallback eligibility سخت شد.
- Smoke E2E به Push/PR افزوده شد.
- README و Release docs اصلاح شد.
- Audit وابستگی‌ها صفر شد.

## اقدام بعدی توصیه‌شده

ابتدا بسته را در Git Repository قرار دهید و CI را اجرا کنید. مهم‌ترین دادهٔ جدید موردنیاز، نتیجهٔ واقعی Job `e2e-smoke` است.

## هشدارهای مهم

- E2E محلی این تحویل به‌دلیل Policy مدیریتی اجرا نشد؛ آن را Pass تلقی نکنید.
- Schemaها در 1.6.14 تغییر نکرده‌اند.
- Session Legacy را به‌صورت خاموش Minimum نکنید.
- Performance fixes 1.6.11 را حذف یا دور نزنید.
- Source/runtime final correlation همچنان Python-owned است.

## ترتیب بازخوانی برای مهندس جدید

1. `START-HERE.md` بسته.
2. `docs/handover/ai-context.md`.
3. `docs/handover/architecture.md`.
4. `docs/release/1.6.16-release-notes.md`.
5. `docs/release/test-results-1.6.14.md`.
6. Frozen contract.
7. Source و تست‌های تغییرکرده.

## پرامپت پیشنهادی برای AI جدید

```text
نقش: مهندس ارشد EDIS Browser Runtime Collector.

بستهٔ Handover نسخهٔ 1.6.14 تنها زمینهٔ این Session است. ابتدا START-HERE.md، docs/handover/ai-context.md، session-recovery.md و Frozen Contract را کامل بخوان.

قواعد:
- تقدم منابع و مرزهای WordPress/Browser/Python/LLM را حفظ کن.
- هیچ Schema، Permission، Public API یا Evidence semantic را بدون درخواست صریح تغییر نده.
- workflow_mode:null فقط Runtime Evidence است.
- Session Legacy دارای Capture Runtime-only است.
- هیچ تست اجرا‌نشده را موفق اعلام نکن.
- در نبود شواهد از status: insufficient_evidence استفاده کن.

کار اول:
نتیجهٔ CI نسخهٔ 1.6.14، به‌خصوص job e2e-smoke را بررسی کن. اگر Pass بود، گزارش qualification را ثبت کن. اگر Fail بود، Artifactهای Trace و browser log را evidence-first تحلیل کن و قبل از اصلاح، root cause و scope را گزارش بده.
```
