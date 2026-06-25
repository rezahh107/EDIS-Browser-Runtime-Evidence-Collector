# Contributing

Keep changes within the evidence-collection boundary. New permissions, data categories, remote communication, browser-specific coupling, or privacy-sensitive capture require an implementation decision, threat-model update, reviewer-guide update, store disclosure update, and tests.

Use the committed npm lockfile and `npm ci`. Before submitting a change, run `npm run release:gate:no-browser`. Changes that affect browser runtime behavior must also pass `npm run release:gate:chrome` and, when Edge behavior is affected, `npm run release:gate:edge` with real supported browser executables.

Do not commit fabricated pass claims, secrets, private page captures, dependency caches, browser profiles, or generated evidence containing user-profile paths. Browser-unavailable results must remain unavailable rather than being reclassified as passes.
