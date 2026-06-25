# Determinism specification

## EDIS-CJ-1

- Object keys sort by ascending UTF-16 code-unit order.
- Arrays retain input order.
- Unicode is preserved exactly; no NFC/NFD normalization is applied.
- Output is compact UTF-8 JSON followed by exactly one LF.
- Negative zero becomes `0`.
- Non-finite numbers, unsafe integers, undefined values, dangerous prototype keys, and unpaired surrogates are rejected.
- Cyclic arrays/objects are rejected with stable `TypeError` code `EDIS_CANONICAL_CYCLE`.
- Canonicalization is bounded by maximum depth `128`, maximum visited nodes `1,000,000`, and maximum entries per array/object `100,000`; boundary failures use stable codes and are never sanitized into sentinel strings.
- Repeated references outside the active ancestor chain remain valid and serialize by value.
- Semantic identity excludes declared operational identifiers/timestamps and operational diagnostics.
- Semantic diagnostics use code, severity, scope, and canonical structured context; localized text is excluded.

The authoritative vectors are in `shared-vectors/edis-cj-1-v1.0.0.json`.

## EDIS-URL-1

The profile canonicalizes a structured locator object, never a raw URL string. Credentials are rejected; query and fragment are excluded; host is ASCII serialized; default ports are removed; non-default ports preserved; path case and repeated slashes preserved; dot segments resolved; unreserved percent escapes decoded; retained escapes use uppercase hex; sensitive path segments are deterministically redacted.

The authoritative vectors are in `shared-vectors/edis-url-1-v1.0.0.json`.

## Traversal and ordering

Elements use bounded DOM pre-order. Emitted `document_order` and `node_id` are contiguous. Observation indexes are unique and contiguous from zero. Package paths sort lexically. ZIP timestamps, headers, permissions, encoding, and compression mode are fixed.

## Hashes

Shared digests use lowercase `sha256:<64 lowercase hexadecimal>` representation. Screenshot internal storage checksums remain implementation-internal and are revalidated before export.
