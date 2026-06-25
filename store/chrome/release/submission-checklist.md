# Chrome Web Store submission checklist

## Automated evidence

- [ ] Full Chrome browser E2E passed on the final package.
- [ ] Runtime semantic determinism passed.
- [ ] Real or explicitly documented simulated worker recovery passed.
- [ ] Navigation cancellation passed.
- [ ] Privacy fixtures passed.
- [ ] Extension-origin network isolation passed.
- [ ] Automated accessibility checks passed.
- [ ] Two clean production builds reproduced byte-for-byte.
- [ ] Package, permissions, CSP, schemas, checksums, and ZIP metadata passed.

## Manual evidence

- [ ] Minimum supported Chrome tests passed.
- [ ] Current stable Chrome tests passed.
- [ ] Current stable Edge tests passed.
- [ ] Required Windows coverage passed.
- [ ] Manual accessibility and reduced-motion checks passed.

## Administration

- [ ] Store account available: `STORE_ACCOUNT_REQUIRED`.
- [ ] Public privacy policy published: `PRIVACY_POLICY_PUBLIC_URL_REQUIRED`.
- [ ] Public support page published: `SUPPORT_PUBLIC_URL_REQUIRED`.
- [ ] Developer contact completed: `DEVELOPER_CONTACT_REQUIRED`.
- [ ] Listing descriptions and language records entered.
- [ ] Privacy practices and data-use declarations completed.
- [ ] Permission explanations entered.
- [ ] Screenshots and required promotional assets uploaded.
- [ ] Reviewer instructions supplied.
- [ ] Final package SHA-256 matches release evidence.
- [ ] Rollback package and response owner recorded.

Do not submit while any required item remains unchecked.
