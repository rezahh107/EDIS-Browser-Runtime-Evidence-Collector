# Browser 1.6.13 Contract Delta

## وضعیت

```yaml
status: no_evidence_contract_change
collector_version: 1.6.13
runtime_snapshot_schema: 1.6.0
capture_session_schema: 1.1.0
python_feed_readiness_schema: 1.1.0
runtime_package_manifest_schema: 1.4.1
```

## تغییر قرارداد خارجی شواهد

`not_applicable`

نسخهٔ 1.6.13 هیچ تغییری در Schemaهای شواهد، Canonical JSON، SHA-256 inventory، مسیرهای Package، Source Context semantics یا مرزهای Cross-product ایجاد نمی‌کند.

## تغییر سیاست Workflow و Export

ماتریس مجاز نهایی:

```text
workflow_mode = MINIMUM_PYTHON_FEED
  -> RUNTIME_EVIDENCE: allowed
  -> MINIMUM_PYTHON_FEED: readiness-gated

workflow_mode = RUNTIME_EVIDENCE
  -> RUNTIME_EVIDENCE: allowed
  -> MINIMUM_PYTHON_FEED: forbidden

workflow_mode = null
  -> RUNTIME_EVIDENCE: allowed
  -> MINIMUM_PYTHON_FEED: forbidden
```

`null` به معنی نبود Provenance صریح Workflow است و نباید به‌عنوان Opt-in خوراک Python تفسیر شود.

## سیاست Capture برای Sessionهای Legacy

- Session خالی با `workflow_mode: null` می‌تواند پیش از اولین Capture Workflow را انتخاب کند.
- Session دارای Capture با `workflow_mode: null` به‌صورت Runtime-only تفسیر می‌شود.
- هیچ Capture قدیمی به‌صورت خاموش به Minimum Python Feed ارتقا داده نمی‌شود.

## تغییر CI

Smoke test هدفمند Export fallback در Push و Pull Request اجرا می‌شود. Suite کامل مرورگر همچنان Scheduled است. این تغییر Contract محصول نیست و فقط Release evidence را تقویت می‌کند.
