import { mkdir, rm } from "node:fs/promises";

const root = "artifacts/release-gate";
await mkdir(root, { recursive: true });
for (const id of ["repository-tests", "unit-tests", "security-tests", "integration-tests"])
  await rm(`${root}/${id}-results.json`, { force: true });
