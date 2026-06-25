# Rollback plan

1. Preserve the last known-good source archive, production package, store version, and SHA-256 inventory.
2. Stop rollout or unpublish only through the authorized store account: `STORE_ACCOUNT_REQUIRED`.
3. Record the incident, affected version, discovery time, severity, and evidence.
4. Disable distribution of the affected package without deleting investigation artifacts.
5. Reproduce the issue in an isolated profile and determine whether local evidence requires user cleanup instructions.
6. Prepare the smallest corrective release without weakening privacy, permissions, determinism, or validation gates.
7. Run the full release gate and required manual matrix again.
8. Publish user-facing support guidance at `SUPPORT_PUBLIC_URL_REQUIRED` when action is required.
9. Keep developer communication and store correspondence under `DEVELOPER_CONTACT_REQUIRED`.

No remote kill switch, telemetry control channel, or automatic update service outside the browser store is implemented by the extension.
