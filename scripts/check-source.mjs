import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["src", "schemas", "tests", "scripts"];
const files = [];
for (const root of roots) await walk(root);
for (const file of files) {
  if (/\.(png|jpg|jpeg|webp|gif|ico)$/i.test(file)) continue;
  const text = await readFile(file, "utf8");
  if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/.test(text))
    throw new Error(`Dynamic evaluation found in ${file}`);
  if (/innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\s*\(/.test(text))
    throw new Error(`Unsafe HTML assignment found in ${file}`);
  if (
    file.startsWith(`src${path.sep}`) &&
    /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|importScripts\s*\(/.test(
      text,
    )
  )
    throw new Error(`Network-capable API found in ${file}`);
  if (/https?:\/\//.test(text) && /\.(html|css)$/i.test(file))
    throw new Error(`Remote resource found in ${file}`);
  if (/\bMath\.random\s*\(|\bcrypto\.randomUUID\s*\(/.test(text))
    throw new Error(`Random identifier generation found in ${file}`);
  if (/\b(?:setTimeout|setInterval)\s*\(\s*["'`]/.test(text))
    throw new Error(`String-based timer found in ${file}`);
  if (
    file.startsWith(`src${path.sep}`) &&
    /\b(?:EDIS_TEST_HOOK|__edisTest|testOnlyHook)\b/.test(text)
  )
    throw new Error(`Test-only hook found in production source: ${file}`);
}
console.log(`Source security scan inspected ${files.length} files.`);

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(full);
  }
}
