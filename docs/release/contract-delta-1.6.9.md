# Browser 1.6.9 Contract Delta

## Status

```yaml
change_type: workflow_and_protocol_hardening
frozen_cross_product_ownership: unchanged
evidence_schema_change: none
permission_change: none
```

## Additions

The local capture protocol now carries an explicit workflow mode and supports deterministic page probing and Minimum Python Feed preflight checks. These messages are operational controls; they do not create analytical truth.

Minimum Python Feed capture is accepted only when explicit evidence establishes:

- confirmed matching Source Context;
- one of the required requested profiles;
- a measured viewport width not already used in that session;
- a required profile not already used in that session;
- the same deterministic page fingerprint as prior observations;
- consistent Source Context references.

Runtime Evidence mode is intentionally not subject to the distinct-width/profile guard.

## Unchanged boundaries

WordPress owns saved source evidence. Browser owns runtime collection and capture-readiness evidence. Python owns deterministic merge, final correlation, resolution, formulas, rules, diagnostics, and TruthReport conclusions.
