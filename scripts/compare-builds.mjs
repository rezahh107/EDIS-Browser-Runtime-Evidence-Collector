import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const chromeRoot = path.resolve("dist/chrome");
const edgeRoot = path.resolve("dist/edge");
const chromeFiles = await listFiles(chromeRoot);
const edgeFiles = await listFiles(edgeRoot);
const expected = new Set(chromeFiles.filter((name) => name !== "manifest.json"));
const actual = new Set(edgeFiles.filter((name) => name !== "manifest.json"));
if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name)))
  throw new Error("Chrome and Edge build file sets diverged.");
for (const name of [...expected].sort()) {
  const [chromeBytes, edgeBytes] = await Promise.all([
    readFile(path.join(chromeRoot, name)),
    readFile(path.join(edgeRoot, name)),
  ]);
  if (!chromeBytes.equals(edgeBytes)) throw new Error(`Chrome and Edge build drift: ${name}`);
}
console.log(
  `Chrome and Edge builds are byte-identical outside manifest.json (${expected.size} files).`,
);

async function listFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix.replaceAll(path.sep, "/"), entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, name)));
    else files.push(name);
  }
  return files.sort();
}
