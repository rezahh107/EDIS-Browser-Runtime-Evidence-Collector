import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

export const E2E_UNAVAILABLE_MARKER = "EDIS_E2E_ENV_UNAVAILABLE";
const ENVIRONMENT_SCHEMA_VERSION = "1.1.0";

export function requestedBrowser(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--browser");
  const value = index >= 0 ? argv[index + 1] : "chrome";
  if (value !== "chrome" && value !== "edge") throw new Error("Browser must be chrome or edge.");
  return value;
}

export function requestedHeadless(argv = process.argv.slice(2)) {
  if (argv.includes("--headed")) return false;
  const raw = process.env.EDIS_E2E_HEADLESS;
  return raw === "1" || raw?.toLowerCase() === "true";
}

export function artifactDirectory() {
  return path.resolve(process.env.EDIS_E2E_ARTIFACT_DIR ?? "artifacts/browser-e2e");
}

export async function resolveExecutable(browser) {
  return (await resolveExecutableEvidence(browser)).path;
}

export async function resolveExecutableEvidence(browser) {
  const allowChromiumFallback = process.env.EDIS_E2E_ALLOW_CHROMIUM_FALLBACK === "true";
  const candidates = [
    ...(browser === "edge"
      ? [
          {
            value: process.env.EDIS_EDGE_EXECUTABLE_PATH,
            source: "environment:EDIS_EDGE_EXECUTABLE_PATH",
            explicit: true,
          },
          ...stableBrowserCandidates("edge"),
        ]
      : [
          {
            value: process.env.EDIS_CHROME_EXECUTABLE_PATH,
            source: "environment:EDIS_CHROME_EXECUTABLE_PATH",
            explicit: true,
          },
          ...stableBrowserCandidates("chrome"),
          ...(allowChromiumFallback
            ? [
                {
                  value: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
                  source: "environment:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
                  explicit: true,
                },
                {
                  value: chromium.executablePath(),
                  source: "playwright:bundled-chromium",
                  explicit: false,
                },
              ]
            : []),
        ]),
  ];
  let executablePath;
  let source;
  for (const candidate of candidates) {
    if (typeof candidate.value !== "string" || candidate.value.length === 0) continue;
    try {
      executablePath = await validateExecutable(candidate.value, candidate.explicit);
      source = candidate.source;
      break;
    } catch {
      continue;
    }
  }
  if (!executablePath || !source)
    throw unavailable(
      `No usable exact ${browser === "edge" ? "Microsoft Edge Stable" : "Google Chrome Stable"} executable was found. ` +
        `Set ${browser === "edge" ? "EDIS_EDGE_EXECUTABLE_PATH" : "EDIS_CHROME_EXECUTABLE_PATH"}.`,
    );
  const versionCommand = executableVersion(executablePath);
  if (!versionCommand)
    throw unavailable(`Browser version command failed for ${sanitizePath(executablePath)}.`);
  const browserFamily = classifyBrowserFamily(executablePath, versionCommand);
  const exactRequestedProduct =
    (browser === "chrome" && browserFamily === "chrome") ||
    (browser === "edge" && browserFamily === "edge");
  if (!exactRequestedProduct && process.env.EDIS_E2E_ALLOW_CHROMIUM_FALLBACK !== "true")
    throw unavailable(
      `Resolved executable is ${browserFamily}, not exact ${browser === "edge" ? "Microsoft Edge Stable" : "Google Chrome Stable"}: ${sanitizePath(executablePath)}.`,
    );
  return {
    path: executablePath,
    source,
    executable_basename: path.basename(executablePath),
    executable_sha256: await hashFile(executablePath),
    version_command: versionCommand,
    browser_family: browserFamily,
    exact_requested_product: exactRequestedProduct,
    qualification_scope:
      browserFamily === "chrome"
        ? "EXACT_GOOGLE_CHROME"
        : browserFamily === "edge"
          ? "EXACT_MICROSOFT_EDGE"
          : "AUTOMATED_PLAYWRIGHT_CHROMIUM",
  };
}

function stableBrowserCandidates(browser) {
  if (process.platform === "win32") {
    const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(
      Boolean,
    );
    return programFiles.flatMap((root) =>
      browser === "edge"
        ? [
            {
              value: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
              source: "system:windows-edge-stable",
              explicit: false,
            },
          ]
        : [
            {
              value: path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
              source: "system:windows-chrome-stable",
              explicit: false,
            },
          ],
    );
  }
  if (process.platform === "darwin") {
    return browser === "edge"
      ? [
          {
            value: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            source: "system:macos-edge-stable",
            explicit: false,
          },
        ]
      : [
          {
            value: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            source: "system:macos-chrome-stable",
            explicit: false,
          },
        ];
  }
  return browser === "edge"
    ? [
        { value: "/usr/bin/microsoft-edge", source: "system:linux-edge-stable", explicit: false },
        {
          value: "/opt/microsoft/msedge/msedge",
          source: "system:linux-edge-stable",
          explicit: false,
        },
      ]
    : [
        { value: "/usr/bin/google-chrome", source: "system:linux-chrome-stable", explicit: false },
        {
          value: "/opt/google/chrome/chrome",
          source: "system:linux-chrome-stable",
          explicit: false,
        },
      ];
}

async function prepareExactPackagedExtension(browser, artifacts) {
  const metadata = JSON.parse(await readFile("package.json", "utf8"));
  const filename = `edis-runtime-collector-${browser}-${metadata.version}.zip`;
  const zipPath = path.resolve("artifacts/packages", filename);
  let zipBytes;
  try {
    zipBytes = new Uint8Array(await readFile(zipPath));
  } catch (error) {
    throw unavailable(
      `Exact packaged ${browser} artifact is unavailable: ${zipPath}. Run npm run build && node scripts/package-release.mjs. ${safeMessage(error)}`,
    );
  }
  const entries = parseStoreZip(zipBytes);
  const extensionPath = path.join(artifacts, `exact-packaged-${browser}`);
  await rm(extensionPath, { recursive: true, force: true });
  await mkdir(extensionPath, { recursive: true });
  for (const [name, data] of entries) {
    validateZipPath(name);
    const destination = path.resolve(extensionPath, name);
    if (!destination.startsWith(`${extensionPath}${path.sep}`))
      throw unavailable(`ZIP entry escaped exact package root: ${name}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  if (!entries.has("manifest.json"))
    throw unavailable(`Exact packaged ${browser} artifact has no root manifest.json.`);
  return {
    extensionPath,
    zipPath,
    zipSha256: createHash("sha256").update(zipBytes).digest("hex"),
    zipBytes: zipBytes.length,
    entryCount: entries.size,
  };
}

function parseStoreZip(bytes) {
  const output = new Map();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const signature = view.getUint32(0, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw unavailable(`Unexpected ZIP signature at ${offset}.`);
    const flags = view.getUint16(6, true);
    const method = view.getUint16(8, true);
    if ((flags & 0x0008) !== 0 || method !== 0)
      throw unavailable(
        "Exact extension ZIP must be deterministic stored ZIP without data descriptors.",
      );
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    if (compressedSize !== uncompressedSize)
      throw unavailable("Stored extension ZIP size mismatch.");
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (dataEnd > bytes.length) throw unavailable("Truncated exact extension ZIP entry.");
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    validateZipPath(name);
    if (output.has(name)) throw unavailable(`Duplicate exact extension ZIP path: ${name}`);
    output.set(name, bytes.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  if (output.size === 0) throw unavailable("Exact extension ZIP contains no entries.");
  return output;
}

function validateZipPath(value) {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0"))
    throw unavailable(`Unsafe exact ZIP path: ${value}`);
  if (value.split("/").some((part) => part === "" || part === "." || part === ".."))
    throw unavailable(`Unsafe exact ZIP path: ${value}`);
}

async function validateExecutable(candidate, explicit) {
  const resolved = path.resolve(candidate);
  try {
    const metadata = await stat(resolved);
    if (!metadata.isFile()) throw new Error("not a file");
    if (process.platform !== "win32") await access(resolved, fsConstants.X_OK);
  } catch (error) {
    throw unavailable(
      `${explicit ? "Provided" : "Detected"} browser executable is not usable: ${resolved}. ${safeMessage(error)}`,
    );
  }
  return resolved;
}

export async function preflightExtension({
  browser,
  headless,
  executablePath,
  executableEvidence,
}) {
  const artifacts = artifactDirectory();
  await mkdir(artifacts, { recursive: true });
  const evidence =
    executableEvidence ?? (await resolveEvidenceForKnownPath(browser, executablePath));
  const exactPackage = await prepareExactPackagedExtension(browser, artifacts);
  const extensionPath = exactPackage.extensionPath;
  const manifestPath = path.join(extensionPath, "manifest.json");
  let manifest;
  let manifestBytes;
  try {
    manifestBytes = await readFile(manifestPath);
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw unavailable(`Built extension is unavailable at ${manifestPath}. ${safeMessage(error)}`);
  }

  const extensionArtifact = {
    sha256: exactPackage.zipSha256,
    fileCount: exactPackage.entryCount,
    zipBytes: exactPackage.zipBytes,
  };
  const policyBlock = await detectManagedUnpackedExtensionBlock(executablePath);
  if (policyBlock)
    throw unavailable(
      `Managed browser policy ${policyBlock.policyName} contains ${JSON.stringify(policyBlock.blockedValue)} in ${policyBlock.sourcePath}; unpacked extensions are disabled in this browser environment.`,
    );

  const profile = path.join(artifacts, `preflight-profile-${browser}`);
  const logs = [];
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless,
      executablePath,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-component-update",
        "--disable-background-networking",
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        ...(process.env.EDIS_E2E_ALLOW_NO_SANDBOX === "true" ? ["--no-sandbox"] : []),
      ],
      timeout: 30_000,
    });
    context.on("serviceworker", (worker) => logs.push(`serviceworker ${worker.url()}`));
    const existing = context
      .serviceWorkers()
      .find((worker) => worker.url().startsWith("chrome-extension://"));
    const worker = existing ?? (await context.waitForEvent("serviceworker", { timeout: 20_000 }));
    if (!worker.url().startsWith("chrome-extension://"))
      throw unavailable(`Loaded worker has an unexpected URL: ${worker.url()}`);
    const serviceWorkerUrl = worker.url();
    const extensionId = new URL(serviceWorkerUrl).host;
    const runtimeVersion = context.browser()?.version() ?? null;
    if (!runtimeVersion)
      throw unavailable("Browser runtime version was not available after launch.");
    const environment = {
      schema_version: ENVIRONMENT_SCHEMA_VERSION,
      requested_target: browser,
      browser_family: evidence.browser_family,
      exact_requested_product: evidence.exact_requested_product,
      qualification_scope: evidence.qualification_scope,
      executable_path: sanitizePath(executablePath),
      executable_source: evidence.source,
      executable_basename: evidence.executable_basename,
      executable_sha256: evidence.executable_sha256,
      browser_version_command: evidence.version_command,
      browser_runtime_version: runtimeVersion,
      headless,
      execution_mode: headless ? "headless_persistent_context" : "headed_persistent_context",
      extension_target: browser,
      extension_id: extensionId,
      service_worker_url: serviceWorkerUrl,
      extension_artifact_sha256: extensionArtifact.sha256,
      extension_artifact_hash_profile: "EDIS-PACKAGED-ZIP-SHA256-1",
      extension_artifact_file_count: extensionArtifact.fileCount,
      extension_zip_sha256: exactPackage.zipSha256,
      extension_zip_entry_count: exactPackage.entryCount,
      extension_zip_bytes: exactPackage.zipBytes,
      source_under_test: "exact_packaged_zip_extracted",
      schema_version_runtime_snapshot: manifest.version ? "1.6.0" : null,
      indexeddb_name: "edis-runtime-collector",
      indexeddb_version: 4,
      manifest_sha256: createHash("sha256").update(manifestBytes).digest("hex"),
      manifest_version: manifest.version,
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      os: `${os.type()} ${os.release()}`,
    };
    await writeFile(
      path.join(artifacts, "environment.json"),
      `${JSON.stringify(environment, null, 2)}\n`,
      "utf8",
    );
    logs.push(`extension ${extensionId}`);
    return { extensionId, extensionPath, environment };
  } catch (error) {
    if (error instanceof Error && error.message.includes(E2E_UNAVAILABLE_MARKER)) throw error;
    throw unavailable(
      `The browser could not load the unpacked Manifest V3 extension. ${safeMessage(error)}`,
    );
  } finally {
    await writeFile(path.join(artifacts, "preflight.log"), `${logs.join("\n")}\n`, "utf8");
    if (context) await closeContextWithDeadline(context);
  }
}

async function resolveEvidenceForKnownPath(browser, executablePath) {
  const versionCommand = executableVersion(executablePath);
  if (!versionCommand)
    throw unavailable(`Browser version command failed for ${sanitizePath(executablePath)}.`);
  const browserFamily = classifyBrowserFamily(executablePath, versionCommand);
  const exactRequestedProduct =
    (browser === "chrome" && browserFamily === "chrome") ||
    (browser === "edge" && browserFamily === "edge");
  if (!exactRequestedProduct && process.env.EDIS_E2E_ALLOW_CHROMIUM_FALLBACK !== "true")
    throw unavailable(
      `Resolved executable is ${browserFamily}, not exact ${browser === "edge" ? "Microsoft Edge Stable" : "Google Chrome Stable"}: ${sanitizePath(executablePath)}.`,
    );
  return {
    source: "resolved:path",
    executable_basename: path.basename(executablePath),
    executable_sha256: await hashFile(executablePath),
    version_command: versionCommand,
    browser_family: browserFamily,
    exact_requested_product: exactRequestedProduct,
    qualification_scope:
      browserFamily === "chrome"
        ? "EXACT_GOOGLE_CHROME"
        : browserFamily === "edge"
          ? "EXACT_MICROSOFT_EDGE"
          : "AUTOMATED_PLAYWRIGHT_CHROMIUM",
  };
}

export async function detectManagedUnpackedExtensionBlock(
  executablePath,
  policyDirectories = managedPolicyDirectories(executablePath),
) {
  if (process.platform !== "linux") return null;
  for (const directory of policyDirectories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      const sourcePath = path.join(directory, entry.name);
      try {
        const policy = JSON.parse(await readFile(sourcePath, "utf8"));
        const blocklist = policy?.ExtensionInstallBlocklist;
        if (Array.isArray(blocklist) && blocklist.includes("*"))
          return { policyName: "ExtensionInstallBlocklist", blockedValue: "*", sourcePath };
      } catch {
        // Invalid or unreadable policy files are not interpreted as evidence.
      }
    }
  }
  return null;
}

function managedPolicyDirectories(executablePath) {
  const name = path.basename(executablePath).toLowerCase();
  if (name.includes("edge")) return ["/etc/opt/edge/policies/managed"];
  if (name.includes("chrome") && !name.includes("chromium"))
    return ["/etc/opt/chrome/policies/managed"];
  if (name.includes("chromium")) return ["/etc/chromium/policies/managed"];
  return [];
}

function classifyBrowserFamily(executablePath, versionCommand) {
  const value = `${path.basename(executablePath)} ${versionCommand}`.toLowerCase();
  if (value.includes("microsoft edge") || value.includes("msedge") || value.includes(" edg/"))
    return "edge";
  if (value.includes("chrome-for-testing")) return "chromium";
  if (value.includes("google chrome")) return "chrome";
  return "chromium";
}

function executableVersion(executable) {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() || result.stderr.trim() : null;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export function unavailable(message) {
  return new Error(`${E2E_UNAVAILABLE_MARKER}: ${message}`);
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizePath(value) {
  const home = os.homedir();
  return home && value.startsWith(home) ? value.replace(home, "<HOME>") : value;
}

async function closeContextWithDeadline(context) {
  let timer;
  try {
    await Promise.race([
      context.close().catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 5_000);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
