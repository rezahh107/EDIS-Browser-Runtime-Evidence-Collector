# Release Checklist

- Confirm version consistency in package metadata, manifests, schemas, and changelog.
- Install from a real reviewed pnpm lockfile using a frozen install.
- Run type checking, lint, format check, unit, integration, security, schema, and accessibility checks.
- Build Chrome and Edge artifacts and validate manifest permissions and CSP.
- Run Chrome and Edge end-to-end suites in supported stable browsers.
- Review dependency audit results and licenses.
- Verify no remote code, telemetry, broad host access, or unsupported permission.
- Inspect ZIP paths, checksums, and local-only behavior.
- Update reviewer guide, privacy disclosure, screenshots, and rollback notes.
- Do not release Firefox until its dedicated build and end-to-end gates pass.
