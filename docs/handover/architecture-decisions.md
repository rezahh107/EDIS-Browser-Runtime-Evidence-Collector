# تصمیم‌های معماری

## ADR-001 — افزونه Local-only

**تصمیم:** هیچ Backend، Telemetry یا Upload خودکار وجود ندارد.

**دلیل:** حفظ حریم خصوصی، کاهش سطح حمله و تطابق با مرز EDIS.

**Tradeoff:** Sync بین دستگاه‌ها و پردازش ابری وجود ندارد.

**گزینهٔ ردشده:** ارسال شواهد به API مرکزی؛ به‌دلیل تغییر مدل اعتماد و نیاز به سیاست داده رد شد.

## ADR-002 — جداسازی Browser از Python

**تصمیم:** Browser فقط شواهد Runtime و binding اولیه تولید می‌کند.

**دلیل:** جلوگیری از حدس دامنه و حفظ محاسبات دترمینیستیک در Python.

**گزینهٔ ردشده:** محاسبهٔ final correlation، breakpoint resolution یا UX scoring در افزونه.

## ADR-003 — ZIP بدون Compression Runtime

**تصمیم:** ZIP Store-only با ترتیب و timestamp ثابت.

**دلیل:** Review ساده، Dependency کمتر و خروجی تکرارپذیر.

**Tradeoff:** حجم بیشتر نسبت به Deflate.

## ADR-004 — Canonical JSON نسخه‌بندی‌شده

**تصمیم:** EDIS-CJ-1، ترتیب کلید ثابت، LF نهایی، رد NaN/Infinity و unsafe values.

**دلیل:** Hash و Package reproducibility.

## ADR-005 — IndexedDB برای Evidence

**تصمیم:** Evidence حجیم در IndexedDB، Preferences در storage.local و coordination کوچک در storage.session.

**دلیل:** ظرفیت و Transaction مناسب‌تر از storage.local.

## ADR-006 — Capture-scoped caches

**تصمیم:** Style، Rect، Visibility، Ancestor و Identity index فقط در طول یک Capture cache می‌شوند.

**دلیل:** کاهش `getComputedStyle` و DOM traversal بدون ایجاد State پایدار یا stale.

**گزینهٔ ردشده:** Cache سراسری بین Captureها؛ به‌دلیل Mutation و خطر Fact قدیمی رد شد.

## ADR-007 — Export Worker

**تصمیم:** Hash، validation و ZIP assembly در Dedicated Worker انجام می‌شود.

**دلیل:** کاهش Block شدن Side Panel.

**Tradeoff:** پروتکل Worker و مدیریت Failure لازم است.

## ADR-008 — Minimum Python Feed به‌عنوان Workflow صریح

**تصمیم:** Minimum Feed نیاز به opt-in و Guard از اولین Capture دارد.

**دلیل:** Profile، Source Context و Capture environment بخشی از Provenance هستند.

**گزینهٔ ردشده:** ارتقای Session Runtime یا Legacy به Feed فقط بر اساس Readiness نهایی.

## ADR-009 — Fallback یک‌طرفه

**تصمیم:** Minimum Session می‌تواند Runtime package بسازد؛ جهت معکوس ممنوع است.

**دلیل:** تنزل ادعا Factها را تغییر نمی‌دهد؛ ارتقا Provenance ساختگی ایجاد می‌کند.

## ADR-010 — `workflow_mode: null` fail-closed

**تصمیم نسخهٔ 1.6.13:** `null` فقط Runtime Evidence را مجاز می‌کند. اگر Session دارای Capture باشد، Capture workflow نیز Runtime-only تفسیر می‌شود.

**دلیل:** نبود فیلد برابر با نبود opt-in است، نه مجوز ضمنی.

**Tradeoff:** برای Minimum Feed باید Session جدید ساخته شود.

## ADR-011 — Smoke E2E در PR/Push

**تصمیم:** مسیر بحرانی fallback در هر Push/PR با Chromium و Persistent Context اجرا شود؛ Suite کامل هفتگی باقی بماند.

**دلیل:** تعادل میان زمان CI و کشف سریع Regression.

**گزینهٔ ردشده:** Full E2E روی هر Commit؛ هزینه و ناپایداری محیطی بیشتر دارد.

## ADR-012 — عدم Traversal iframe و Shadow DOM

**تصمیم:** iframe و shadow-root descendants پیمایش نمی‌شوند.

**دلیل:** مرز امنیتی، پیچیدگی و احتمال تغییر semantics.

**وضعیت:** محدودیت مستند، نه Bug پنهان.
