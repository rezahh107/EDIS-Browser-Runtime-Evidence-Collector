# Security Policy

Report suspected vulnerabilities privately to the project maintainers. Do not include real credentials, private page captures, or user data in reports.

The extension uses Manifest V3, strict extension-page CSP, no remote code, minimal permissions, bounded DOM traversal, bounded ancestor visibility and relationship searches, validated messages, sender checks, safe package paths, canonical serialization, and local-only storage. Security fixes are released with a changelog entry and regression coverage.

Supported security updates apply to the latest `1.x` release line.

Every exported JSON artifact must have a declared bundled schema. Pre-export validation rejects non-canonical JSON, unregistered JSON artifacts, broken references, duplicate package paths, malformed checksums, and source-binding claims that lack required uniqueness evidence.
