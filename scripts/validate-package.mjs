import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = process.argv[2] ?? "chrome";
if (!new Set(["chrome", "edge"]).has(target)) throw new Error("Unknown production target.");
const root = path.resolve("dist", target);
const manifestPath = path.join(root, "manifest.json");
await stat(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const project = JSON.parse(await readFile("project.config.json", "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required.");
if (manifest.version !== project.extensionVersion) throw new Error("Built manifest version drift.");
if (manifest.background?.service_worker !== "background/service-worker.js")
  throw new Error("A service-worker background is required.");
if (manifest.background?.type !== "module") throw new Error("The service worker must be a module.");
if (manifest.content_scripts !== undefined)
  throw new Error("Persistent content scripts are forbidden.");
const approved = new Set(["activeTab", "scripting", "storage", "sidePanel"]);
for (const permission of manifest.permissions ?? []) {
  if (!approved.has(permission)) throw new Error(`Unexpected permission: ${permission}`);
}
for (const required of approved) {
  if (!(manifest.permissions ?? []).includes(required))
    throw new Error(`Required permission is missing: ${required}`);
}
if ((manifest.host_permissions ?? []).length > 0)
  throw new Error("Persistent host permissions are forbidden.");
const csp = manifest.content_security_policy?.extension_pages ?? "";
if (csp !== "script-src 'self'; object-src 'none'; base-uri 'none'")
  throw new Error("Extension CSP does not match the hardened policy.");
const serialized = JSON.stringify(manifest);
for (const banned of [
  "<all_" + "urls>",
  "debugger",
  "webRequest",
  "cookies",
  "history",
  "nativeMessaging",
]) {
  if (serialized.includes(`\"${banned}\"`))
    throw new Error(`Forbidden manifest capability: ${banned}`);
}
if (target === "chrome" && manifest.minimum_chrome_version !== "116")
  throw new Error("Chrome minimum version drift.");
for (const required of [
  "background/service-worker.js",
  "content/index.js",
  "workers/export-worker.js",
  "popup/index.html",
  "sidepanel/index.html",
  "options/index.html",
  "schemas/runtime-snapshot.schema.json",
])
  await stat(path.join(root, required));

for (const file of await listFiles(root)) {
  if (/\.map$/i.test(file)) throw new Error(`Source map leaked into production: ${file}`);
  if (!/\.(js|html|css|json)$/i.test(file)) continue;
  const text = await readFile(path.join(root, file), "utf8");
  if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/.test(text))
    throw new Error(`Dynamic evaluation in built file: ${file}`);
  if (/\bMath\.random\s*\(|\bcrypto\.randomUUID\s*\(/.test(text))
    throw new Error(`Random generation in built file: ${file}`);
  if (/\b(?:setTimeout|setInterval)\s*\(\s*["'`]/.test(text))
    throw new Error(`String-based timer in built file: ${file}`);
  if (/\b(?:EDIS_TEST_HOOK|__edisTest|testOnlyHook)\b/.test(text))
    throw new Error(`Test-only hook in built file: ${file}`);
  if (
    /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|importScripts\s*\(/.test(
      text,
    )
  )
    throw new Error(`Network-capable API in built file: ${file}`);
  if (/\.(?:html|css)$/i.test(file) && /(?:https?:)?\/\//i.test(text))
    throw new Error(`Remote resource reference in built file: ${file}`);
  if (/\.html$/i.test(file)) {
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1] ?? "") && (match[2] ?? "").trim().length > 0)
        throw new Error(`Inline script in built file: ${file}`);
    }
  }
}
console.log(`Validated hardened ${target} package at ${manifestPath}`);

async function listFiles(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(directory, relative)));
    else output.push(relative);
  }
  return output;
}
