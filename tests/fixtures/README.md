# Test Fixtures

These local synthetic pages exercise documented evidence categories without private data: Elementor V3 markers, Atomic V4-like custom elements, hybrid markers, non-Elementor content, RTL, bounded large DOM, mobile viewport behavior, horizontal overflow, hidden elements, clipping, fixed positioning, and sticky positioning. They are test inputs, not claimed real Elementor exports.

## WordPress 7 compatibility fixture

`wordpress-7-block-visibility.html` is a controlled synthetic runtime fixture modeled on the documented WordPress 7 viewport-visibility class names and breakpoint behavior. It is `verified_by_synthetic_fixture`; it is not a real WordPress export, database record, or captured production page. It exists only to regression-test Browser Collector visibility pruning without claiming WordPress source truth.
