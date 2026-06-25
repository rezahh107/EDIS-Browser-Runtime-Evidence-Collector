# Browser 1.6.8 Contract Delta

## Status

No cross-product or evidence-schema delta.

Browser 1.6.8 is a producer-compliance hotfix for the existing protocol. The required `CAPTURE_START.requestedProfileId` field was already part of the 1.6.7 protocol and Runtime Snapshot 1.5.0 provenance model.

## Implementation hardening

- Popup and side-panel producers remain evidence-labeling interfaces only.
- Requested profiles remain user-request provenance, not resolved Elementor breakpoints.
- Strict sender-side typing and validation do not replace service-worker validation; both layers remain active.
- Python ownership of merge, resolution, formulas, rules, diagnostics, and TruthReport is unchanged.
