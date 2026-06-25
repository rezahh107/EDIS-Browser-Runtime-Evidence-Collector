# Deterministic Package Report — Browser 1.6.4

## Canonical data

- Canonicalization profile: `EDIS-CJ-1`.
- Object keys use deterministic UTF-16 code-unit ordering.
- Arrays preserve declared order.
- Unicode is preserved as entered; no normalization is silently applied.
- Non-finite numbers, unsafe integers, negative zero ambiguity, dangerous keys, unpaired surrogates, and unsupported values are rejected or normalized according to the profile.
- Canonical JSON is UTF-8 and ends with exactly one LF byte.

## Hash representation

- Algorithm enum: `sha256`.
- Shared digest representation: `sha256:<64 lowercase hexadecimal characters>`.
- Full-file integrity and semantic identity are separate.
- Operational diagnostics and timestamps remain in full-file integrity but are excluded from semantic identity where the schema specifies.

## ZIP determinism

- Entry paths are sorted lexically.
- Store-only ZIP encoding is used.
- ZIP timestamps and headers are fixed.
- File permissions and path separators are stable.
- Source maps and build-time timestamps are absent from production bundles.

## Reproducibility result

Two clean builds for Chrome and two clean builds for Edge produced byte-identical build trees and production ZIPs in the recorded environment. Chrome and Edge non-manifest output files were byte-identical; the target manifest difference is intentional.

## Cross-language gate

Browser JavaScript passes the bundled EDIS-CJ-1 and EDIS-URL-1 vectors. Coordinated cross-product conformance remains conditional until the same vectors pass unchanged in WordPress PHP and Python.

## Runtime Package 1.4.0 inventory preserved by Browser 1.6.4

The reproducible inventory includes the Runtime Snapshot/Package 1.4.0 schemas, strict schema index, single-location diagnostics invariant, hidden-subtree/readiness fields, capture state/environment evidence, runtime/document instances, source/runtime cardinality artifact, computed-style-origin availability, and source-document/section/widget metadata. Operational timestamps and identifiers remain outside semantic equality where specified by the shared contract.
