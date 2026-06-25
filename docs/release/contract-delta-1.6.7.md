# Browser 1.6.7 Contract Delta

## Status

This is a versioned additive Browser evidence and workflow delta. The frozen cross-product architecture is unchanged.

## Added evidence

- Runtime Snapshot Schema `1.5.0` adds required `viewport.requested_profile_id`.
- Observation Set Schema `1.1.0` adds required `requested_profile_id` per observation.
- New Browser artifact: `validation/python-feed-readiness.json`, Schema `1.0.0`.
- Minimum-feed ZIP may embed the imported WordPress Bridge Context unchanged at `source-context/wordpress-source-context.json`.

## Semantics

`requested_profile_id` records user workflow intent only. It is not an inferred or resolved breakpoint. Python must use measured viewport dimensions and explicit versioned breakpoint evidence for breakpoint-dependent processing.

`python_feed_readiness=READY` establishes package-input availability and consistency. It does not establish successful source/runtime correlation, correct layout, responsive quality, or rule outcomes.
