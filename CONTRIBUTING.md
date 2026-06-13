# Contributing

Keep changes within the evidence-collection boundary. New permissions, data categories, remote communication, browser-specific coupling, or privacy-sensitive capture require an implementation decision, threat-model update, reviewer-guide update, and tests.

Before submitting a change, run type checking, linting, formatting checks, unit and security tests, and the relevant production build. Do not commit generated dependency reports, synthetic pass claims, secrets, page captures containing private data, or a lockfile not created by pnpm.
