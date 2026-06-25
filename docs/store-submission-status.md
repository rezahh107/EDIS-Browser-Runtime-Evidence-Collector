# Store Submission Status

Repository-level source, schema, permission, CSP, local-only, remote-code, determinism, storage, export, and Chrome/Edge drift checks are automated by the release gate. Browser claims are valid only when the Playwright extension suite successfully loads the final unpacked package in a real supported browser executable.

The project remains not ready for submission while any of these are absent or failing:

- real Chrome browser E2E;
- runtime semantic determinism;
- service-worker recovery and navigation cancellation;
- runtime privacy and extension-origin network isolation;
- automated and manual accessibility checks;
- minimum and current browser manual compatibility records;
- public privacy-policy and support URLs;
- final store screenshots, assets, declarations, and account administration.

Environment unavailability is recorded with exit code `2`; it is never converted to a pass or a manual-only technical gate.
