# نقشهٔ راه توسعه

## تکمیل‌شده

- قرارداد Runtime Snapshot و Package نسخه‌بندی‌شده.
- Canonical JSON و SHA-256 inventory.
- Source Context import محلی.
- Minimum Python Feed و Readiness artifact.
- Capture environment guards.
- Performance hardening 1.6.11.
- Export recovery 1.6.12.
- Export provenance و CI hardening 1.6.13.
- Buildهای Chrome و Edge و Reproducibility.

## در حال انجام

`not_applicable`

در زمان تحویل هیچ Branch یا Patch نیمه‌تمام ثبت نشده است.

## اقدامات بعدی با اولویت

### P0 — اجرای CI Smoke در GitHub

- Push نسخهٔ 1.6.13 به Repository.
- مشاهدهٔ Job `e2e-smoke` روی Push/PR.
- ذخیرهٔ Artifact و نتیجهٔ واقعی.
- در صورت Failure، Trace و browser log بررسی شود.

### P0 — صلاحیت دستی Chrome و Edge

- نصب Build با Load Unpacked.
- اجرای سناریوی Minimum Session ناقص و Runtime fallback.
- تأیید Download ZIP و Package validation.

### P1 — Browser performance profiling

- صفحهٔ واقعی Elementor بزرگ.
- Chrome Performance trace.
- Memory profile برای Snapshot و Export نزدیک سقف.
- مقایسه با benchmark 1.6.10/1.6.11.

### P1 — Fixtureهای واقعی WordPress/Elementor

- Atomic V4 nested.
- Responsive profiles.
- Variables و Global Classes.
- Hybrid V3/V4.
- Interactions.

### P2 — بررسی Transport binary

فقط پس از E2E واقعی و Contract review، امکان انتقال Snapshot با transferable بررسی شود.

### P2 — Push status events

جایگزینی Polling باید با Message protocol نسخه‌بندی‌شده و تست recovery انجام شود.

## معیار پایان Milestone بعدی

```yaml
chrome_smoke: passed
edge_manual_fallback: passed
runtime_package_external_validation: passed
no_schema_or_permission_regression: true
performance_profile: captured
```
