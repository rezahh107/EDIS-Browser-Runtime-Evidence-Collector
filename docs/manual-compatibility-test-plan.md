# Manual Compatibility Test Plan

## Purpose

This plan covers browser and operating-system behaviors that must be confirmed on real supported desktop environments before store submission. Automated evidence does not replace these records.

## Required environments

- Minimum supported Chrome: version 116.
- Current stable Google Chrome at test time.
- Current stable Microsoft Edge at test time.
- Windows 10 or Windows 11 for at least one Chrome and one Edge pass.

Record the exact browser build and operating-system build. Do not infer compatibility from a newer Chromium build.

## Common prerequisites

1. Extract the target installable package.
2. Confirm `manifest.json` is at the selected folder root.
3. Open the browser extension-management page and enable Developer Mode.
4. Load the folder unpacked.
5. Keep screenshots and text preview disabled unless the test explicitly enables them.
6. Use only controlled fixtures or pages whose data may be captured.
7. Save screenshots, exported packages, browser logs, and notes under a unique evidence directory.

## Required tests

| Test ID | Coverage | Required result |
|---|---|---|
| MAN-001 | Extension installation | Package loads without manifest errors; service worker, popup, side panel, and options are reachable. |
| MAN-002 | HTTP fixture | User-triggered capture completes and exports valid JSON evidence. |
| MAN-003 | HTTPS fixture | User-triggered capture completes without mixed-content or CSP errors. |
| MAN-004 | Elementor V3 | Existing V3 IDs are recorded as evidence and no IDs are invented. |
| MAN-005 | Atomic V4 | Existing Atomic IDs are recorded and structural identity is used only when needed. |
| MAN-006 | Hybrid V3/V4 | One legacy element does not invalidate the document or Atomic evidence. |
| MAN-007 | Non-Elementor page | Generic structural evidence is captured without Elementor claims. |
| MAN-008 | RTL page | UI and page evidence remain usable; direction is recorded as a fact. |
| MAN-009 | Large DOM | Budgets terminate traversal and produce diagnostics instead of hanging. |
| MAN-010 | Restricted browser page | Capture is rejected with a clear diagnostic and no false completion. |
| MAN-011 | Screenshot disabled | No PNG is stored or exported; JSON evidence remains complete. |
| MAN-012 | Screenshot enabled | Warning and opt-in are explicit; visible viewport PNG and independent checksum are produced. |
| MAN-013 | Browser restart | Persisted sessions and completed snapshots are reconstructed after a full browser restart. |
| MAN-014 | Worker/storage recovery | Interrupted or incomplete work is resumed safely or reaches an explicit terminal failure. |
| MAN-015 | Navigation during capture | Evidence from different documents is not merged and navigation is diagnosed. |
| MAN-016 | Clear local data | Confirmation is required, focus returns correctly, and extension-owned data is cleared. |
| MAN-017 | 320 px / 200% zoom | Controls remain keyboard-operable and readable without hidden critical actions. |
| MAN-018 | Persian / RTL UI | Localized labels, direction, focus order, and status announcements are usable. |
| MAN-019 | Network isolation | Developer tools show no extension-originated external requests. |
| MAN-020 | Export retention | Default export removes temporary large evidence; retention preserves it only when selected. |

## Execution matrix

Run MAN-001 through MAN-020 on current stable Chrome. Repeat the installation, capture, screenshot, restart/recovery, navigation, export, accessibility, and network-isolation tests on current stable Edge. Run at minimum MAN-001, MAN-002, MAN-006, MAN-009, MAN-010, MAN-011, MAN-013, and MAN-015 on Chrome 116.

## Acceptance

A row is accepted only when its actual result, evidence path, tester, and date are recorded. Any failure affecting installation, privacy, security, determinism, recovery, or package integrity blocks release. A browser or environment that cannot execute a required test is `BLOCKED`, not `PASS`.
