# ADR 0001: Local Store-Only ZIP

Status: accepted.

The runtime package uses a small local ZIP encoder with uncompressed entries. This avoids a runtime dependency, remote code, license ambiguity, and service-worker compression complexity. The cost is a larger export. Deterministic order, fixed timestamps, safe paths, CRC-32, and SHA-256 checksums are mandatory.
