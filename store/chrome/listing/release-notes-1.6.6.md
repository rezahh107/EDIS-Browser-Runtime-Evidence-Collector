# EDIS Runtime Collector 1.6.6

This patch release strengthens deterministic runtime metrics and package qualification without adding permissions or moving analytical responsibilities into the browser.

- Uses one shared Elementor marker classifier for discovered and emitted metrics.
- Adds `skipped_elementor_elements` and enforces `discovered = emitted + skipped`.
- Rejects contradictory Elementor metrics with a stable diagnostic code.
- Strengthens external validation for duplicate/non-contiguous observations and missing/orphan snapshots.
- Advances Runtime Snapshot and Runtime Package Schema to `1.4.1`.
- Preserves local-only operation, deterministic ZIP output, atomic capture start, and transactional finalization.

Browser runtime E2E remains `insufficient_evidence` in the release environment because managed Chromium policy blocks unpacked extensions. No unexecuted browser test is claimed as passed.
