import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error(
    "Usage: node scripts/validate-personal-runtime-packages.mjs <runtime-package.zip> [...]",
  );
  process.exit(2);
}

const packages = [];
const issues = [];
for (const input of inputs) {
  const absolute = path.resolve(input);
  const bytes = await readFile(absolute);
  const sha256 = digest(bytes);
  const entries = parseStoreZip(new Uint8Array(bytes));
  const byPath = new Map(entries.map((entry) => [entry.path, entry.bytes]));
  const readJson = (entryPath) => {
    const entry = byPath.get(entryPath);
    if (!entry) throw new Error(`${entryPath} is missing in ${input}`);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(entry));
  };
  const packageManifest = readJson("package-manifest.json");
  const runtimeContext = readJson("context/runtime-context.json");
  const packageValidation = readJson("validation/package-validation.json");
  const pythonReadiness = readJson("validation/python-feed-readiness.json");
  const observationSet = readJson("observation-set.json");
  const checksums = validateChecksums(byPath);
  const snapshots = [...byPath.keys()]
    .filter((entryPath) => /^observations\/observation-[0-9]{4}\/snapshot\.json$/.test(entryPath))
    .sort()
    .map((entryPath) => ({ path: entryPath, artifact: readJson(entryPath) }));
  const firstSnapshot = snapshots[0]?.artifact ?? null;
  const diagnostics = collectDiagnostics(byPath);
  const provenanceDiagnostic = diagnostics.find(
    (item) => item.code === "EDIS_RUNTIME_EXPORT_PROVENANCE",
  );
  const record = {
    input: absolute,
    zip_sha256: sha256,
    entry_count: entries.length,
    checksum_validation: checksums.ok ? "PASS" : "FAIL",
    checksum_issues: checksums.issues,
    package_validation_state: packageValidation.data?.validation_state ?? null,
    producer_version: packageManifest.producer?.version ?? null,
    context_producer_version: runtimeContext.producer?.version ?? null,
    runtime_bundle_id: packageManifest.data?.runtime_bundle_id ?? null,
    session_id: packageManifest.data?.session_id ?? null,
    observation_set_id: packageManifest.data?.observation_set_id ?? null,
    snapshot_count: snapshots.length,
    screenshot_count: packageManifest.data?.screenshot_count ?? 0,
    capture_completeness: packageManifest.data?.capture_completeness ?? null,
    python_feed_readiness_state: pythonReadiness.data?.state ?? null,
    browser_family:
      runtimeContext.data?.runtime_environment?.browser_family ??
      firstSnapshot?.data?.runtime_environment?.browser_family ??
      null,
    browser_version:
      runtimeContext.data?.runtime_environment?.browser_version ??
      firstSnapshot?.data?.runtime_environment?.browser_version ??
      null,
    page_fingerprint: firstSnapshot?.data?.page?.page_fingerprint ?? null,
    manifest_sha256: provenanceDiagnostic?.context?.manifest_sha256 ?? null,
    extension_id: provenanceDiagnostic?.context?.extension_id ?? null,
    extension_release_version:
      provenanceDiagnostic?.context?.extension_release_version ??
      packageManifest.producer?.version ??
      null,
    collector_engine_version:
      provenanceDiagnostic?.context?.collector_engine_version ??
      packageManifest.producer?.version ??
      null,
    exported_package_sha256: sha256,
    package_manifest_schema_version: packageManifest.schema_version ?? null,
    runtime_context_schema_version: runtimeContext.schema_version ?? null,
    diagnostic_codes: [...new Set(diagnostics.map((item) => item.code))].sort(),
  };
  packages.push(record);
  if (record.checksum_validation !== "PASS") issues.push(`${input}: checksum validation failed`);
  if (record.package_validation_state !== "PASS")
    issues.push(`${input}: package validation is not PASS`);
  if (record.producer_version !== record.extension_release_version)
    issues.push(`${input}: producer version and extension release version diverge`);
}

const identityCollisions = collisionReport(packages, [
  "session_id",
  "runtime_bundle_id",
  "observation_set_id",
]);
const browserFamilies = new Set(packages.map((item) => item.browser_family).filter(Boolean));
const pageFingerprints = new Set(packages.map((item) => item.page_fingerprint).filter(Boolean));
const status =
  issues.length > 0 || identityCollisions.some((item) => item.colliding_values.length > 0)
    ? "WARN"
    : "PASS";
const output = {
  schema_version: "1.0.0",
  profile: "PERSONAL_LOCAL_AUDIT",
  status,
  package_count: packages.length,
  browser_families: [...browserFamilies].sort(),
  shared_page_fingerprint: pageFingerprints.size === 1 ? [...pageFingerprints][0] : null,
  packages,
  cross_package_identity: identityCollisions,
  issues,
  limitations: [
    "This validator checks local package integrity and provenance fields; it is not formal Chrome/Edge store runtime qualification.",
    "Single-viewport packages remain personal-audit evidence unless DESKTOP/TABLET/MOBILE captures are supplied.",
    "Missing screenshot/source-context evidence is reported by package diagnostics and Python feed readiness.",
  ],
};

const root = path.resolve(
  process.env.EDIS_PERSONAL_RUNTIME_VALIDATION_DIR ?? "artifacts/personal-runtime-validation",
);
await mkdir(root, { recursive: true });
const json = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(path.join(root, "personal-runtime-validation.json"), json, "utf8");
await writeFile(
  path.join(root, "personal-runtime-validation.sha256"),
  `${digest(Buffer.from(json))}  personal-runtime-validation.json\n`,
  "utf8",
);
await writeFile(path.join(root, "personal-runtime-validation.md"), renderMarkdown(output), "utf8");
console.log(`Personal runtime validation: ${status} (${packages.length} package(s)).`);

function collectDiagnostics(byPath) {
  const diagnostics = [];
  for (const [entryPath, bytes] of byPath) {
    if (!entryPath.endsWith(".json") || entryPath.startsWith("schemas/")) continue;
    try {
      const artifact = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (Array.isArray(artifact.diagnostics)) diagnostics.push(...artifact.diagnostics);
      if (Array.isArray(artifact.data?.diagnostics)) diagnostics.push(...artifact.data.diagnostics);
    } catch {
      // Ignore: package-level validation/checksums report malformed JSON separately.
    }
  }
  return diagnostics.filter((item) => item && typeof item.code === "string");
}

function collisionReport(records, keys) {
  return keys.map((key) => {
    const seen = new Map();
    for (const record of records) {
      const value = record[key];
      if (typeof value !== "string") continue;
      if (!seen.has(value)) seen.set(value, []);
      seen.get(value).push(record.input);
    }
    return {
      key,
      colliding_values: [...seen]
        .filter(([, files]) => files.length > 1)
        .map(([value, files]) => ({ value, files })),
    };
  });
}

function validateChecksums(byPath) {
  const issues = [];
  const checksumEntry = byPath.get("checksums.sha256");
  if (!checksumEntry) return { ok: false, issues: ["checksums.sha256 is missing"] };
  const text = new TextDecoder("utf-8", { fatal: true }).decode(checksumEntry);
  for (const line of text.trimEnd().split("\n")) {
    const match = /^(sha256:[0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) {
      issues.push("Malformed checksum line");
      continue;
    }
    const [, expected, entryPath] = match;
    const bytes = byPath.get(entryPath);
    if (!bytes) issues.push(`Missing checksum target: ${entryPath}`);
    else if (`sha256:${digest(bytes)}` !== expected) issues.push(`Checksum mismatch: ${entryPath}`);
  }
  return { ok: issues.length === 0, issues };
}

function parseStoreZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = [];
  const paths = new Set();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`Invalid ZIP local header at ${offset}.`);
    if (offset + 30 > bytes.length) throw new Error("Truncated ZIP local header.");
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if ((flags & 0x0008) !== 0 || method !== 0 || compressedSize !== uncompressedSize)
      throw new Error("Only deterministic store-only ZIP packages are supported.");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("Truncated ZIP entry.");
    const entryPath = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (
      !entryPath ||
      entryPath.startsWith("/") ||
      entryPath.includes("\\") ||
      entryPath.includes("..")
    )
      throw new Error(`Unsafe ZIP path: ${entryPath}`);
    if (paths.has(entryPath)) throw new Error(`Duplicate ZIP entry: ${entryPath}`);
    paths.add(entryPath);
    entries.push({ path: entryPath, bytes: bytes.subarray(dataStart, dataEnd) });
    offset = dataEnd;
  }
  if (entries.length === 0) throw new Error("ZIP contains no local entries.");
  return entries;
}

function renderMarkdown(output) {
  const lines = [
    `# Personal Runtime Validation`,
    ``,
    `Status: **${output.status}**`,
    ``,
    `| Package | Browser | Producer | Release | Session | Bundle | Validation | Python feed |`,
    `|---|---|---|---|---|---|---|---|`,
  ];
  for (const item of output.packages) {
    lines.push(
      `| ${path.basename(item.input)} | ${item.browser_family ?? "—"} ${item.browser_version ?? ""} | ${item.producer_version ?? "—"} | ${item.extension_release_version ?? "—"} | ${item.session_id ?? "—"} | ${item.runtime_bundle_id ?? "—"} | ${item.package_validation_state ?? "—"} | ${item.python_feed_readiness_state ?? "—"} |`,
    );
  }
  lines.push("", "## Cross-package identity", "");
  for (const item of output.cross_package_identity) {
    lines.push(
      `- ${item.key}: ${item.colliding_values.length === 0 ? "no collision" : "collision"}`,
    );
  }
  if (output.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of output.issues) lines.push(`- ${issue}`);
  }
  lines.push("", "## Limitations", "");
  for (const limitation of output.limitations) lines.push(`- ${limitation}`);
  return `${lines.join("\n")}\n`;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
