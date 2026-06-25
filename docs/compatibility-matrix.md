# Compatibility matrix

| Input or environment                                            | Browser 1.6.14 behavior                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Package 1.4.1                                           | Current Browser 1.6.14 package; validate only through the explicit 1.4.1 schema route                                                                   |
| Runtime Package 1.4.0 / Browser 1.6.0–1.6.5                     | Prior valid package; preserve through an explicit 1.4.0 route without synthesizing `skipped_elementor_elements`                                         |
| Runtime Package 1.3.0 / Browser 1.5.0                           | Legacy/current-coordinated input; preserve through an explicit 1.3.0 route without synthesizing 1.4.0 fields                                            |
| Older valid Browser packages                                    | Python-owned versioned legacy ingestion only                                                                                                            |
| Invalid legacy/current package                                  | `INVALID`                                                                                                                                               |
| No WordPress Bridge Context                                     | Capture remains valid; source binding and cardinality are `INSUFFICIENT` or unmatched                                                                   |
| Incomplete Minimum Python Feed session                         | Feed export remains blocked; ordinary Runtime Evidence export is allowed one-way when runtime export has no independent blocker                         |
| WordPress Bridge Context 1.0.0                                  | Accepted only after local strict validation                                                                                                             |
| Elementor V3                                                    | Raw markers and bounded runtime facts collected                                                                                                         |
| Atomic V4                                                       | Raw markers and bounded runtime facts collected                                                                                                         |
| Hybrid V3/V4                                                    | One architecture kind does not invalidate the document                                                                                                  |
| Repeated direct source marker in validated `loop-item` document | Runtime instance may be `REPEATED_TEMPLATE`                                                                                                             |
| Repeated direct source marker without loop-item evidence        | `MULTIPLE_RUNTIME_ROOTS`; repetition meaning remains unresolved                                                                                         |
| iframe documents                                                | Not traversed; iframe capture state is recorded when applicable                                                                                         |
| shadow-root descendants                                         | Not traversed                                                                                                                                           |
| protected browser pages                                         | Rejected before injection                                                                                                                               |
| WordPress 7 viewport visibility                                 | Synthetic runtime fixture verifies effective-hidden subtree pruning at documented mobile/tablet/desktop ranges; real WordPress fixture remains required |

Missing 1.4.1 evidence is never synthesized for 1.4.0 or 1.3.0 packages. Final source/runtime correlation remains Python-owned.

Verification label: `verified_by_synthetic_fixture`. Complete WordPress 7+ compatibility remains `insufficient_evidence` until controlled real fixtures and browser executions are available.
