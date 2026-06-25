# EDIS Shared Golden Vectors

These vectors are the cross-product conformance gate for the frozen EDIS contract.

- `edis-cj-1-v1.0.0.json` defines canonical JSON bytes. Unicode is preserved exactly as supplied; no NFC/NFD normalization is applied. Object keys use ascending UTF-16 code-unit order, finite IEEE-754 binary64 numbers are serialized using the shortest ECMAScript representation with lowercase `e` and no `+`, negative zero becomes `0`, unsafe integers and invalid Unicode are rejected, and every canonical document ends with exactly one LF.
- `edis-url-1-v1.0.0.json` defines privacy-safe URL locator facts and their semantic SHA-256 digest. Queries and fragments are excluded by default. Locator equality is matching evidence, never proof of document identity.

The PHP, JavaScript, and Python implementations must consume these exact files and produce the same outputs before coordinated compatibility is claimed.
