# EDIS Runtime Collector 1.6.13

- Prevents legacy sessions without an explicit workflow from being exported as Minimum Python Feed.
- Keeps legacy captured sessions runtime-only instead of silently upgrading their workflow provenance.
- Hardens Runtime Evidence fallback eligibility.
- Adds a targeted Chromium fallback-download smoke test to Push and Pull Request CI.
- Corrects release documentation and updates the development dependency lock to remove known audit findings.

No new permission, remote service, evidence schema, tracking behavior, or network feature was added.
