# Schema Reference

JSON Schemas under `schemas/` define artifact envelopes, runtime snapshots, sessions, diagnostics, and the package manifest. Every top-level JSON artifact includes schema version, artifact type, availability status, collector source, capture timestamp, data, and diagnostics.

Canonical serialization sorts object keys, preserves meaningful array order, rejects non-finite numbers and prototype-sensitive keys, uses UTF-8, and terminates text files with LF. Operational timestamps are retained but are not presented as saved-document truth.
