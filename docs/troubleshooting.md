# Troubleshooting

## Manifest missing

Select the extracted Chrome or Edge folder that contains `manifest.json` directly at its root. Do not select the complete source repository root.

## Capture is rejected

Only ordinary HTTP/HTTPS tabs are supported. Browser settings, stores, extension pages, and other protected pages cannot receive activeTab injection.

## Capture is partial

Review `capture_completeness.reasons`. Use Deep DOM for depth truncation, but do not remove hard bounds. A valid package can contain partial evidence.

## Source binding is unmatched

Import the matching WordPress 3.2.0 `bridge/source-context.json`, select the correct document when multiple documents exist, and capture the same published page version. Locator hash alone does not prove a match.

## Binding is ambiguous

Check duplicate `data-id` values, conflicting `data-elementor-id` page markers, or duplicate Elementor IDs in the source index. User confirmation cannot override conflicts.

## Screenshot is missing

Screenshots require explicit opt-in and the original tab must remain active on the same URL until the screenshot step completes. JSON evidence remains exportable after screenshot failure.

## Export fails

The extension blocks internally inconsistent packages. Review the displayed error and diagnostics; no incomplete package is declared valid.

## Minimum Python Feed preflight blocks the ZIP

Blocking requirements are not ZIP or download failures. Resolve the listed feed requirements, or use **Export runtime evidence instead** when the preflight offers it. The fallback is one-way: a Minimum Python Feed session may produce ordinary Runtime Evidence, but an ordinary Runtime Evidence session cannot be upgraded into a Minimum Python Feed package.
