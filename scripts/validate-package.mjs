import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = process.argv[2] ?? "chrome";
const root = path.resolve("dist", target);
const manifestPath = path.join(root, "manifest.json");
await stat(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required.");
const approved =
  target === "firefox"
    ? new Set(["activeTab", "scripting", "storage"])
    : new Set(["activeTab", "scripting", "storage", "sidePanel"]);
for (const permission of manifest.permissions ?? []) {
  if (!approved.has(permission)) throw new Error(`Unexpected permission: ${permission}`);
}
if ((manifest.host_permissions ?? []).length > 0)
  throw new Error("Persistent host permissions are forbidden.");
const csp = manifest.content_security_policy?.extension_pages ?? "";
if (csp.includes("unsafe-eval") || csp.includes("unsafe-inline") || /https?:/.test(csp))
  throw new Error("Unsafe extension CSP.");
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
console.log(`Validated ${target} package manifest at ${manifestPath}`);
