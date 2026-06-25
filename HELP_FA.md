# راهنمای افزونه EDIS Browser Runtime Evidence Collector

نسخه 1.6.16

## حداقل خوراک پایتون

برای گزینهٔ **خروجی حداقل خوراک پایتون** ابتدا Source Context همان صفحه را از WordPress وارد و سند آن را صریحاً انتخاب کنید. سپس در یک Session سه Capture با پروفایل‌های درخواستی دسکتاپ، تبلت و موبایل و سه عرض واقعی متمایز ثبت کنید. این پروفایل‌ها فقط Provenance درخواست کاربر هستند و Breakpoint واقعی Elementor را تعیین نمی‌کنند. تمام Observationها باید Page Fingerprint و Source Context Reference یکسان داشته باشند. اگر این شرایط کامل نباشد، خروجی Minimum Python Feed مسدود می‌ماند؛ اما همان Session می‌تواند به‌صورت یک‌طرفه و بدون تغییر واقعیت‌ها به Runtime Evidence صادر شود.

بستهٔ آماده شامل `source-context/wordpress-source-context.json` و `validation/python-feed-readiness.json` است. وضعیت `READY` فقط کامل‌بودن و سازگاری ورودی را اعلام می‌کند و به معنی موفقیت Correlation یا نتیجهٔ تحلیلی نیست.

## شرایط Canonical برای خوراک پایتون

ترتیب Capture آزاد است، اما Session نهایی باید سه Profile یکتای `DESKTOP`، `TABLET` و `MOBILE` و سه عرض واقعی متمایز بر حسب CSS pixel داشته باشد. Browser فقط Profile درخواستی و اندازه واقعی را ثبت می‌کند و هیچ Breakpoint المنتور را حدس یا نام‌گذاری نمی‌کند.

پیش از ساخت Job در حالت Minimum Python Feed، Scroll باید `(0,0)` باشد، صفحه باید `visible` و غیر-prerender باشد، Capture داخل iframe یا Elementor editor preview نباشد، شواهد Admin Bar وردپرس فعال یا مبهم نباشد، و پس از انتظار محدود و نسخه‌بندی‌شده هیچ تصویر حل‌نشده‌ای داخل Viewport باقی نماند. از دست‌رفتن Focus بر اثر کار با Side Panel فقط Warning است و به‌تنهایی Geometry یا خوراک Python را نامعتبر نمی‌کند. LCP به‌عنوان Capture gate استفاده نمی‌شود.

## پیش‌بررسی خروجی و مسیر بازیابی

پنجرهٔ Preflight از نسخهٔ 1.6.12 «الزام‌های مسدودکننده» را از «هشدارهای غیرمسدودکنندهٔ پوشش» جدا می‌کند. وجود Blocker دکمهٔ Minimum Python Feed را غیرفعال نگه می‌دارد. اگر حداقل یک Observation قابل‌خروجی وجود داشته باشد، گزینهٔ **خروجی Runtime Evidence به‌جای خوراک پایتون** همان واقعیت‌های فعلی را بدون Source Context جاسازی‌شده و بدون ادعای Readiness صادر می‌کند. Workflow پیش‌فرض Sessionهای جدید Runtime Evidence است.

## هدف افزونه

این افزونه فقط پس از کلیک صریح شما، شواهد واقعی صفحهٔ رندرشده را ثبت می‌کند. افزونه دربارهٔ خوب یا بد بودن UI تصمیم نمی‌گیرد.

```text
WordPress → دادهٔ ذخیره‌شده و Provenance
Browser   → دادهٔ Runtime و Binding اولیه
Python    → اعتبارسنجی، Merge، Correlation نهایی، Resolver و Rule
LLM       → توضیح و اولویت‌بندی خروجی Python
```

## پروفایل استفادهٔ شخصی

این Build برای نصب خصوصی به روش **Load Unpacked** بهینه شده است. در نسخهٔ 1.6.16 پایداری، بازیابی Service Worker، مصرف محدود منابع و Export دترمینیستیک از آماده‌سازی برای Web Store مهم‌تر هستند. نتایج دقیق تست‌ها و Gateهای اجراشده در `docs/release/test-results-1.6.16.md` ثبت شده‌اند. اجرای Runtime E2E مرورگر در این محیط به‌دلیل ارائه‌نشدن Chrome executable قابل‌استفاده و نبود Chromium نصب‌شدهٔ Playwright در وضعیت `insufficient_evidence` است. اجرای E2E در Edge و ماتریس واقعی WordPress/Elementor همچنان شواهد جداگانه و ناکافی دارند.

## نصب

1. فایل Chrome یا Edge را Extract کنید.
2. وارد `chrome://extensions` یا `edge://extensions` شوید.
3. Developer mode را فعال کنید.
4. روی **Load unpacked** بزنید.
5. پوشه‌ای را انتخاب کنید که `manifest.json` مستقیماً داخل آن است.

## بخش‌های برنامه

### Popup

برای Capture سریع، انتخاب Session، بررسی قابل‌استفاده‌بودن صفحه و دیدن وضعیت اجرای Capture است.

### Side Panel

نسخهٔ نصب‌شده مستقیماً از Manifest خوانده می‌شود و در بالای Popup و Side Panel نمایش داده می‌شود.

کارت «شواهد صفحه و منبع» صفحهٔ رندرشده را از اسناد منبع وردپرس جدا می‌کند و Binding اولیهٔ صفحه، سند انتخاب‌شده، تعداد اسناد حاضر، اثر انگشت کوتاه صفحه و شمارش سکشن، کانتینر، ویجت و ناحیه Runtime را نشان می‌دهد.

پنج مرحله دارد:

1. **Page check:** بررسی می‌کند تب فعلی یک صفحه معمولی HTTP/HTTPS باشد.
2. **Session setup:** چند Capture مرتبط را در یک گروه نگه می‌دارد.
3. **Capture:** پس از کلیک شما یک Snapshot واقعی می‌سازد.
4. **Review:** تعداد عناصر، Overflow، Diagnostics، شاخه‌های قطع‌شده، Subtreeهای مخفی کنارگذاشته‌شده، هشدارهای محیط Capture و کامل‌بودن Capture را نشان می‌دهد.
5. **Export:** قبل از دانلود، Schema، Canonical JSON، Hash، References و ساختار ZIP را کنترل می‌کند.

### Options

در Options می‌توانید این موارد را تنظیم کنید:

- پروفایل Standard، Deep DOM یا Custom؛
- Capture Intent که فقط توضیح هدف است و Rule اجرا نمی‌کند؛
- Screenshot و Text Preview؛
- Text Shape بدون متن خام؛
- Interaction Facts؛
- Relationship Graph؛
- Color Styles، Hidden Elements، Path و Title؛
- Import محلی Bridge Context وردپرس.

## Bridge Context وردپرس

برای اتصال بهتر دادهٔ Runtime به Source، فایل زیر را از پلاگین WordPress 3.2.0 Import کنید:

```text
bridge/source-context.json
```

این فایل فقط روی دستگاه شما خوانده می‌شود، Schema و Hash آن بررسی می‌شود، محدودیت اندازه و عمق دارد، محتوای آن اجرا نمی‌شود و هیچ درخواستی به وردپرس فرستاده نمی‌شود. بدون این فایل نیز Capture معتبر است، ولی Binding معمولاً ناکافی یا Unmatched خواهد بود.

نشانه‌های خام DOM از تفسیر جدا نگه داشته می‌شوند. تأیید شما فقط Provenance است و Evidence متعارض یا ID تکراری را به `EXACT` تبدیل نمی‌کند.

## وضعیت‌های Binding

- `EXACT`: شواهد یکتای سازگار در Runtime و Source همراه با شواهد سازگار صفحه.
- `PROBABLE`: شواهد مفید ولی ناقص، مانند اتصال از طریق Ancestor یا نبود Page Marker.
- `AMBIGUOUS`: ID تکراری یا شواهد متعارض.
- `UNMATCHED`: Source Candidate پیدا نشده است.

این وضعیت‌ها فقط Binding اولیهٔ Browser هستند. Correlation نهایی متعلق به Python است.

## ماژول‌های Evidence

### Evidence Lineage، هویت صفحه، ویجت‌ها و سکشن‌ها

هر Runtime Node صادرشده به Page Context، Observation، سند و عنصر منبع در صورت وجود Binding، نزدیک‌ترین سکشن منبع و Runtime Node ID متصل است. یک صفحهٔ رندرشده می‌تواند هم‌زمان شامل چند سند منبع مانند Page، Header، Footer، Popup یا Loop Template باشد.

نام ویجت و سکشن از ظاهر صفحه حدس زده نمی‌شود. Marker فنی ویجت ممکن است از کلاس DOM بیاید؛ Widget Type دقیق و Editor Label فقط از Source Context معتبر وردپرس گرفته می‌شود. Label سکشن فقط می‌تواند از Editor Label صریح، HTML ID مجاز طبق حالت Privacy، Landmark Tag/Role یا Marker فنی ساختار Elementor بیاید.

فایل `structure/page-structure-summary.json` در پکیج تولید می‌شود و هر Snapshot نیز `runtime_regions` و `page_structure_summary` دارد. این موارد Index و Observation دترمینیستیک هستند، نه نتیجهٔ UX. مدل Merged Page Graph و Correlation نهایی متعلق به Python است.

### Relationship Graph

Parent واقعی DOM را ثبت می‌کند و جداگانه نزدیک‌ترین Parent موجود در Snapshot را نیز نگه می‌دارد. Ancestorهای Positioned، Scroll و Clipping هم ثبت می‌شوند. این ساختار برای Layout Graph برنامه Python بسیار مهم است.

### Interaction Facts

Tag، Role، Tabindex، Disabled، Pointer Events، Cursor و Presence Flagها را ثبت می‌کند. مقدار Href، Form Value، Event Handler و Accessible Name پیش‌فرض صادر نمی‌شود.

### Privacy-safe Text Shape

تعداد Text Node، Grapheme، Word، Line Box، طول Token بدون فاصله، Wrap، Line Clamp و Clipping را بدون متن خام ثبت می‌کند. Form Control و Contenteditable کنار گذاشته می‌شوند. Text Preview گزینه‌ای جدا و پیش‌فرض خاموش است.

### Capture Readiness

در یک بازهٔ زمانی محدود، Ready State، Font API، تعداد کل تصاویر ناقص، تعداد تصاویر ناقص واقعاً قابل‌مشاهده در Viewport، Animation فعال و تغییر ابعاد Document/Viewport بررسی می‌شود. تصویر Lazy-load خارج Viewport یا تصویری که به‌دلیل Ancestor واقعاً پنهان است، Stable Readiness را متوقف نمی‌کند. تصویر ناقص قابل‌مشاهده تا تکمیل یا پایان Hard Budget منتظر می‌ماند.

### Runtime Instance، Document Boundary و Cardinality

Marker معتبر Source می‌تواند برای یک عنصر ذخیره‌شده صفر، یک یا چند Runtime Candidate ثبت کند. این فقط Evidence اولیه است. وضعیت `REPEATED_TEMPLATE` فقط وقتی ثبت می‌شود که Source Context معتبر نوع سند را `loop-item` اعلام کرده باشد؛ در غیر این صورت تکرار با `MULTIPLE_RUNTIME_ROOTS` باقی می‌ماند. Document Instanceها نیز Rootهای جداگانهٔ Page، Header، Footer، Popup، Loop Item یا سندهای دیگر را، در صورت وجود Relationship Evidence، جدا نگه می‌دارند.

### Capture State و Capture Environment

Scroll، Focus، Visibility سند، قابلیت Pointer/Hover، Reduced Motion، Animation و Sticky Candidate ثبت می‌شوند. وجود Admin Bar وردپرس، Elementor Editor Preview، iframe، نبود Focus، پایین‌بودن Scroll، Modal قابل‌مشاهده، Animation فعال و تصویر ناقص قابل‌مشاهده به‌صورت Warning ثبت می‌شود و Blocker نیست.

### وضعیت منشأ Computed Style

Browser فقط مقدار نهایی Computed را مشاهده می‌کند. نسخهٔ 1.6.16 صریحاً ثبت می‌کند که CSSOM Rule Origin بررسی نشده و ادعا نمی‌کند مقدار از Variable، Global Class، Selector یا Stylesheet خاصی آمده است.

## پروفایل‌های Capture

| پروفایل  |    حد عناصر |    حد عمق | کاربرد               |
| -------- | ----------: | --------: | -------------------- |
| Standard |         750 |        24 | بیشتر صفحات          |
| Deep DOM |        1000 |        40 | صفحات عمیق Elementor |
| Custom   | حداکثر 1000 | حداکثر 64 | تست کنترل‌شده        |

اگر Depth یا Budget تمام شود، پکیج می‌تواند از نظر فنی سالم باشد ولی Capture برابر `PARTIAL` ثبت شود.

## حریم خصوصی

وقتی گزینهٔ **Include normalized URL path** خاموش است، هم Path قدیمی و هم `locator_facts` خام صادر نمی‌شوند و فقط Hash مستعار Locator برای تطبیق بعدی باقی می‌ماند. Path هش‌شده همچنان می‌تواند دادهٔ مستعار و حساس به حریم خصوصی باشد. همچنین با خاموش‌بودن Hidden Elements، کل Subtree واقعاً پنهان پیش از مصرف Depth و Scan Budget کنار گذاشته می‌شود. تعداد Subtreeها و حداقل شناخته‌شدهٔ فرزندان مستقیم ثبت می‌شود؛ تعداد کل Descendantها جعل نمی‌شود.

Strict Path Privacy دامنه یا Origin سایت را ناشناس نمی‌کند و Scheme، Host و Port ممکن است همچنان در Evidence باشند.

افزونه این موارد را صادر نمی‌کند:

- مقدار Input، Password، Hidden Input، Textarea و Select؛
- مقدار Href و Form Action؛
- Event Handler؛
- Cookie و History؛
- Query String و Fragment در Locator پیش‌فرض؛
- Telemetry، Analytics یا Upload خودکار.

Screenshot ممکن است اطلاعات قابل مشاهدهٔ صفحه را در پیکسل‌ها داشته باشد؛ بنابراین پیش‌فرض خاموش است.

## ساختار ZIP نسخه 1.6.16

```text
package-manifest.json
checksums.sha256
README.txt
observation-set.json
context/runtime-context.json
context/source-context-reference.json        (اختیاری)
coverage/runtime-coverage.json
coverage/source-binding-coverage.json
coverage/source-runtime-cardinality.json
structure/page-structure-summary.json
observations/observation-0001/snapshot.json
observations/observation-0001/screenshot.png (اختیاری)
diagnostics/diagnostics.json
validation/package-validation.json
schemas/...
```

فایل اختیاری خالی ساخته نمی‌شود. همهٔ JSONها با EDIS-CJ-1 تولید می‌شوند و Digestهای مشترک به‌شکل `sha256:...` هستند.

## روش پیشنهادی Capture

- برای تحلیل صفحه عمومی، در حالت Logged-out یا Incognito Capture بگیرید.
- صفحه را در Scroll و وضعیت موردنظر قرار دهید.
- برای Responsive چند Capture مستقل در یک Session بگیرید.
- برای صفحه عمیق ابتدا Standard و در صورت Depth Limit از Deep DOM استفاده کنید.
- Bridge Context مربوط به همان نسخه Source را Import کنید.
- ZIP وردپرس و ZIP مرورگر را جداگانه به برنامه Python بدهید.

## افزونه چه نتیجه‌ای تولید نمی‌کند؟

افزونه نمی‌گوید Padding خوب یا بد است، Touch Target کوچک است، Responsive ضعیف است یا DOM پیچیده است. افزونه فقط واقعیت را ثبت می‌کند؛ قوانین، Formulaها، Effective Valueها و UX Findingها در Python تولید می‌شوند.

## وضعیت سازگاری با WordPress 7

نسخهٔ 1.6.16 Fixture مصنوعی کنترل‌شدهٔ نسخه قبل را حفظ می‌کند و برای کلاس‌های مستندشدهٔ Visibility در WordPress 7 دارد. این Fixture فقط رفتار Browser Collector را می‌آزماید: Blockی که در Viewport فعلی واقعاً پنهان است، وقتی جمع‌آوری Hidden Elements خاموش باشد همراه با Descendantهایش کنار گذاشته می‌شود و Depth Budget را مصرف نمی‌کند. وضعیت این آزمون `verified_by_synthetic_fixture` است؛ این Fixture Export واقعی وردپرس نیست و سازگاری کامل WordPress 7+، Multisite، Elementor، Theme یا PHP را اثبات نمی‌کند.
