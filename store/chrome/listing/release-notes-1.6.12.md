# EDIS Runtime Collector 1.6.12

- Fixes an export dead end for incomplete Minimum Python Feed sessions.
- Keeps Minimum Python Feed requirements strict while allowing existing facts to be downloaded as ordinary Runtime Evidence.
- Separates blocking requirements from non-blocking warnings in Export preflight.
- Adds an explicit Runtime Evidence fallback button when safe.
- Makes Runtime Evidence the default workflow for new sessions.
- Adds regression coverage for export policy, preflight behavior, package creation, and fallback download.

No new permission, remote service, evidence schema, or tracking behavior was added.
