import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["src", "schemas", "docs", "tests", "scripts"];
const files = [];
for (const root of roots) await walk(root);
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text))
    throw new Error(`Dynamic evaluation found in ${file}`);
  if (/https?:\/\//.test(text) && file.endsWith(".html"))
    throw new Error(`Remote resource found in ${file}`);
  if (/innerHTML\s*=/.test(text)) throw new Error(`Unsafe HTML assignment found in ${file}`);
}
console.log(`Source security scan inspected ${files.length} files.`);

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(full);
  }
}
