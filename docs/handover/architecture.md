# معماری پروژه

## نمای سطح بالا

```text
Popup / Side Panel / Options / Guide
                 │
                 ▼
Application Use Cases
Session ─ Capture ─ Preflight ─ Export
                 │
                 ▼
Domain Contracts and Deterministic Policies
Models ─ Validation ─ Canonicalization ─ Export/Capture Policy
                 │
        ┌────────┴────────┐
        ▼                 ▼
Browser Runtime       Infrastructure
Content Collector     IndexedDB / Browser Adapter / Package Builder
        │                 │
        └──────► Background Service Worker ◄──────┘
                              │
                              ▼
                    Local deterministic ZIP
```

## لایه‌های اصلی

### Presentation

مسیرها:

- `src/popup/`
- `src/sidepanel/`
- `src/options/`
- `src/guide/`
- `src/shared/`

مسئول نمایش Session، Capture، Source Context، Preflight، Progress و Download است. این لایه Fact تحلیلی ایجاد نمی‌کند.

### Application

مسیرها:

- `src/application/sessionUseCases.ts`
- `src/application/exportUseCase.ts`
- `src/application/chunkAssembler.ts`

مسئول هماهنگی Use Caseها است: ساخت Session، انتخاب Session، Preflight، Export و جمع‌کردن Chunkها. تصمیم Policy باید از Domain گرفته شود.

### Domain

مسیر `src/domain/`.

مالک موارد زیر است:

- مدل‌های Versioned.
- Validation و Invariantها.
- Canonical JSON.
- URL normalization.
- Export policy و Capture policy.
- Python Feed readiness facts.
- Diagnostic codes.
- Element identity و marker classification.

Domain به Browser API یا IndexedDB وابسته نیست.

### Background Service Worker

مسیر `src/background/`.

مسئول:

- دریافت پیام‌های معتبر.
- هماهنگی Capture job.
- کنترل Active Tab و URL binding.
- Recovery jobهای Interrupted.
- Persist اتمیک Snapshot و Session.

Service Worker مستقیماً DOM صفحه را نمی‌خواند.

### Content Runtime Collector

مسیر `src/content/`.

مسئول:

- Readiness محدود.
- پیمایش دترمینیستیک DOM.
- Geometry و Computed Style مجاز.
- Visibility و hidden-subtree pruning.
- روابط، Text Shape و marker evidence.
- preliminary source binding.

محدودیت مهم: این لایه Reference resolution، Formula، Rule یا Correlation نهایی انجام نمی‌دهد.

### Infrastructure

مسیر `src/infrastructure/`.

اجزا:

- Browser adapter.
- IndexedDB repository.
- Source Context storage.
- Export Worker client.
- Package builder.
- ZIP writer/reader.
- Hash و Download.
- External package validation.

## رابطهٔ محصولات EDIS

```text
WordPress Evidence Exporter
  saved source evidence + provenance
                │
                ▼ optional local import
Browser Runtime Collector
  rendered runtime evidence + preliminary binding
                │
                ▼ deterministic package
Python Deterministic Engine
  validation + merge + resolution + formulas + correlation + TruthReport
                │
                ▼
LLM Evidence Interpretation
  explanation + prioritization only
```

## جریان Capture

```text
User action
→ create/load session
→ resolve effective workflow
→ active-tab and source-context checks
→ create persisted job
→ inject content collector
→ bounded readiness
→ bounded DOM traversal with capture-scoped caches
→ canonical chunk messages
→ Background revalidation
→ atomic IndexedDB commit
→ Session summary update
```

## جریان Export

```text
User selects export purpose
→ getExportPreflight
→ evaluate runtime blockers
→ evaluate Python-feed blockers when applicable
→ render blockers and warnings separately
→ Domain export policy check
→ Export Worker
→ package validation
→ canonical JSON + SHA-256 + deterministic ZIP
→ local download
```

## سیاست Workflow نسخهٔ 1.6.13

```text
MINIMUM_PYTHON_FEED -> Runtime Evidence: allowed
MINIMUM_PYTHON_FEED -> Minimum Feed: readiness-gated
RUNTIME_EVIDENCE    -> Runtime Evidence: allowed
RUNTIME_EVIDENCE    -> Minimum Feed: forbidden
null                 -> Runtime Evidence: allowed
null                 -> Minimum Feed: forbidden
```

Session خالی با `null` پیش از اولین Capture قابل انتخاب است. Session دارای Capture با `null` Runtime-only است.

## State management

- Preferences: `chrome.storage.local`.
- Active coordination keys: `chrome.storage.session`.
- Durable evidence: IndexedDB.
- UI state: DOM state محلی و refresh از Repository/Message API.
- هیچ State سروری یا Cloud وجود ندارد.

## Rendering flow

Side Panel داده را از Service Worker و Repository می‌خواند، View State دترمینیستیک می‌سازد و فقط متن/کنترل‌ها را Render می‌کند. Export preflight از `makeExportPreflightViewState` برای جداسازی blocker و warning استفاده می‌کند.

## Extension points

- افزودن Artifact جدید: Domain model + Schema + Package builder + external validator + tests.
- افزودن Browser target: Manifest، build target و package validation مستقل.
- افزودن Source Context field: ابتدا قرارداد WordPress و Schema نسخه‌بندی‌شده.
- افزودن Rule/Formula: فقط در Python، نه Browser.
- افزودن UI: بدون ایجاد Fact جدید و با Diagnostic code ثابت.

## مدل امنیت

- بدون Host permission دائمی.
- `activeTab` و `scripting` فقط پس از اقدام کاربر.
- CSP بدون Inline/Remote code.
- بدون telemetry، analytics یا network client.
- پیام‌ها با Protocol، Sender، Origin، Tab، URL، Request ID و Payload validation کنترل می‌شوند.
- JSON ناامن، prototype keys، non-finite numbers و ZIP paths ناامن رد می‌شوند.
- Screenshot و Text Preview به‌صورت opt-in هستند.
