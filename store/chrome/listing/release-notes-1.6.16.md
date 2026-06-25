# EDIS Runtime Collector 1.6.16

- Repairs clean-checkout release validation so repository tests are actually executed.
- Adds deterministic proof that shipped Chrome and Edge ZIPs are rebuilt byte-for-byte from the included source package.
- Pins GitHub Actions dependencies to immutable commit SHAs.
- Preserves the existing local-only permission model and all runtime evidence schemas.
