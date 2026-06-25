import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(await readFile("project.config.json", "utf8"));
const exclusions = [
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
];
const files = [];
for (const absolute of await walk(root)) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  if (excluded(relative)) continue;
  const bytes = await readFile(absolute);
  files.push({
    path: relative,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schema_version: "1.0.0",
  artifact_type: "source_generation_manifest",
  project: "EDIS Browser Runtime Evidence Collector",
  extension_version: config.extensionVersion,
  generated_at: config.releaseTimestamp,
  hash_algorithm: "sha256",
  exclusions,
  files,
};
await writeFile("GENERATION_MANIFEST.json", `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated source manifest for ${files.length} files.`);

function excluded(relative) {
  return exclusions.some((pattern) => {
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

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (excluded(relative)) continue;
    if (entry.isDirectory()) output.push(...(await walk(absolute)));
    else if (entry.isFile()) output.push(absolute);
    else if (entry.isSymbolicLink())
      throw new Error(`Source manifest refuses symbolic link: ${relative}`);
  }
  return output;
}
