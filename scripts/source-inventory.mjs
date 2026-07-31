import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const SOURCE_MANIFEST_EXCLUSIONS = Object.freeze([
  ".git/",
  "dist/",
  "node_modules/",
  "test-results/",
  "playwright-report/",
  "artifacts/",
  "coverage/",
  "GENERATION_MANIFEST.json",
  "__pycache__/",
  "*.pyc",
]);

export async function buildCanonicalSourceManifest(root = process.cwd()) {
  const config = JSON.parse(await readFile(path.join(root, "project.config.json"), "utf8"));
  const files = await collectCanonicalSourceInventory(root);
  return {
    schema_version: "1.0.0",
    artifact_type: "source_generation_manifest",
    project: "EDIS Browser Runtime Evidence Collector",
    extension_version: config.extensionVersion,
    generated_at: config.releaseTimestamp,
    hash_algorithm: "sha256",
    exclusions: [...SOURCE_MANIFEST_EXCLUSIONS],
    files,
  };
}

export async function collectCanonicalSourceInventory(root = process.cwd()) {
  const files = [];
  for (const absolute of await walk(root, root)) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (isSourceManifestExcluded(relative)) continue;
    const bytes = await readFile(absolute);
    files.push({
      path: relative,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  files.sort((a, b) => compare(a.path, b.path));
  return files;
}

export function isSourceManifestExcluded(relative) {
  return SOURCE_MANIFEST_EXCLUSIONS.some((pattern) => {
    if (pattern === "*.pyc") return relative.endsWith(".pyc");
    if (pattern.endsWith("/")) {
      const directory = pattern.slice(0, -1);
      return (
        relative === directory || relative.startsWith(pattern) || relative.includes(`/${pattern}`)
      );
    }
    return relative === pattern;
  });
}

export function canonicalManifestText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function walk(directory, root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (isSourceManifestExcluded(relative)) continue;
    if (entry.isDirectory()) output.push(...(await walk(absolute, root)));
    else if (entry.isFile()) output.push(absolute);
    else if (entry.isSymbolicLink())
      throw new Error(`Source manifest refuses symbolic link: ${relative}`);
  }
  return output;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
