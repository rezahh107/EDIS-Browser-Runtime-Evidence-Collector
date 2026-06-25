# Chrome Web Store privacy practices draft

Administrative fields:

- Privacy policy URL: `PRIVACY_POLICY_PUBLIC_URL_REQUIRED`
- Support URL: `SUPPORT_PUBLIC_URL_REQUIRED`
- Developer contact: `DEVELOPER_CONTACT_REQUIRED`
- Store account: `STORE_ACCOUNT_REQUIRED`

## Data handling summary

The extension processes active-page rendering evidence locally after explicit user action. It does not sell data, transfer data to third parties, use data for advertising, or use data for unrelated purposes.

Potentially sensitive pixels may be present only when the user explicitly enables a visible-viewport screenshot. A bounded text preview may be included only when the user explicitly enables that option. Both are disabled by default. Form values, passwords, hidden input values, cookies, browsing history, URL queries, URL fragments, and authentication tokens are excluded.

Extension preferences and evidence are stored in extension-scoped local storage or IndexedDB. Export is initiated by the user and produces a local ZIP file. Large evidence is deleted after export by default unless retention is enabled.

Dashboard answers must be checked against the exact production package and public privacy policy before submission.
