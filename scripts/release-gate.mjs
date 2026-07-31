import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  evaluateFullReleaseQualification,
  writeFullReleaseQualification,
} from "./full-release-qualification.mjs";

const args = process.argv.slice(2);
const noBrowser = args.includes("--no-browser");
const browserIndex = args.indexOf("--browser");
const browser = browserIndex >= 0 ? args[browserIndex + 1] : "all";
const browserTargets = browser === "all" ? ["chrome", "edge"] : [browser];
if (!noBrowser && !["all", "chrome", "edge"].includes(browser)) {
  console.error("Invalid release browser configuration. Use --browser all, chrome, or edge.");
  process.exit(3);
}

const root = path.resolve("artifacts/release-gate");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
try {
  await validateConfiguration();
} catch (error) {
  const message = safeMessage(error);
  await writeFile(path.join(root, "configuration-error.txt"), `${message}\n`);
  console.error(message);
  process.exit(3);
}

const commands = [
  step("workflow-action-pin-validation", process.execPath, [
    "scripts/validate-workflow-actions.mjs",
  ]),
  step("typecheck", "npm", ["run", "typecheck"]),
  step("lint", "npm", ["run", "lint"]),
  step("format", "npm", ["run", "format:check"]),
  step("repository-test-prepare", process.execPath, ["scripts/prepare-repository-tests.mjs"]),
  step("repository-test-run", process.execPath, ["scripts/run-repository-tests.mjs"], {
    timeoutMs: 300_000,
  }),
  step("repository-test-verify", process.execPath, ["scripts/run-test-gate.mjs"]),
  step("schema-validation", "npm", ["run", "validate:schemas"]),
  step("production-build", "npm", ["run", "build"]),
  step("package-validation", "npm", ["run", "validate"]),
  step("external-package-validation", "npm", ["run", "validate:package:external"]),
  step("reproducible-build", "npm", ["run", "build:reproducible"], {
    timeoutMs: 300_000,
  }),
  step("source-manifest-check", "npm", ["run", "manifest:source:check"]),
  step("source-package", "npm", ["run", "package:source"]),
  step("release-artifact-provenance", "npm", ["run", "validate:release-provenance"], {
    timeoutMs: 300_000,
  }),
  step("store-document-validation", "npm", ["run", "validate:store"]),
  step("production-dependency-audit", "npm", ["run", "audit"]),
];
if (!noBrowser) {
  for (const target of browserTargets) {
    commands.push(
      step(
        `browser-e2e-${target}`,
        process.execPath,
        ["scripts/run-e2e.mjs", "--browser", target],
        {
          env: { EDIS_E2E_ARTIFACT_DIR: path.join("artifacts", "browser-e2e", target) },
          partialTarget: browser !== "all",
        },
      ),
    );
  }
  commands.push(
    step("browser-qualification-audit", process.execPath, [
      "scripts/aggregate-browser-qualification.mjs",
      "artifacts/browser-e2e",
    ]),
  );
}

const results = [];
for (const command of commands) {
  console.log(`Starting release gate step: ${command.id}`);
  const startedAt = new Date().toISOString();
  const result = await execute(
    command,
    path.join(root, `${String(results.length + 1).padStart(2, "0")}-${command.id}.log`),
  );
  results.push({ ...command, ...result, startedAt, finishedAt: new Date().toISOString() });
  if (result.exitCode !== 0) break;
}

const unavailable = results.some((item) => item.exitCode === 2);
const failed = results.some((item) => item.exitCode !== 0 && item.exitCode !== 2);
const initialExitCode = unavailable ? 2 : failed ? 1 : 0;
const mode = noBrowser ? "NO_BROWSER" : browser === "all" ? "FULL_TWO_TARGET" : "PARTIAL_TARGET";
const qualificationScope =
  browser === "all" ? "FULL_TWO_TARGET_RELEASE_GATE" : "PARTIAL_TARGET_QUALIFICATION";
const selectedBrowserStatus = noBrowser
  ? {
      status: "NOT_RUN",
      reason: "No-browser mode explicitly selected; full store readiness is impossible.",
    }
  : {
      status: initialExitCode === 0 ? "PASSED" : unavailable ? "UNAVAILABLE" : "FAILED",
      browser,
      targets: browserTargets,
      qualificationScope,
      fullTwoTargetRequired: true,
    };
const reportBase = {
  schemaVersion: 1,
  projectVersion: JSON.parse(await readFile("package.json", "utf8")).version,
  generatedAt: new Date().toISOString(),
  operatingSystem: `${os.type()} ${os.release()}`,
  architecture: process.arch,
  nodeVersion: process.version,
  packageManagerVersion: await commandOutput("npm", ["--version"]),
  mode,
  browser: selectedBrowserStatus,
  commands: results,
  exitCode: initialExitCode,
  fullStoreReadinessDeclared: false,
};

let fullQualification = null;
if (!noBrowser && browser === "all") {
  let browserQualification = null;
  try {
    browserQualification = JSON.parse(
      await readFile("artifacts/browser-e2e/browser-qualification.json", "utf8"),
    );
  } catch {
    browserQualification = null;
  }
  fullQualification = evaluateFullReleaseQualification(reportBase, browserQualification);
  await writeFullReleaseQualification(
    fullQualification,
    path.join(root, "full-release-qualification.json"),
  );
}

const releaseGateExitCode =
  initialExitCode !== 0
    ? initialExitCode
    : fullQualification && fullQualification.full_release_gate_passed !== true
      ? 1
      : initialExitCode;
const report = {
  ...reportBase,
  browser: noBrowser
    ? selectedBrowserStatus
    : {
        ...selectedBrowserStatus,
        status:
          releaseGateExitCode === 0 ? "PASSED" : releaseGateExitCode === 2 ? "UNAVAILABLE" : "FAILED",
      },
  exitCode: releaseGateExitCode,
  full_release_gate_passed: fullQualification?.full_release_gate_passed === true,
};
await writeFile(path.join(root, "command-results.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, "command-results.md"), renderMarkdown(report));
console.log(`Release gate exit code: ${releaseGateExitCode}`);
process.exit(releaseGateExitCode);

function step(id, command, commandArgs, options = {}) {
  return { id, command, args: commandArgs, ...options };
}
function execute(item, logPath) {
  if (item.id.startsWith("browser-e2e-")) return executeBrowserGate(item, logPath);
  return executeStreamingGate(item, logPath);
}

function executeStreamingGate(item, logPath) {
  return new Promise((resolve) => {
    const child = spawn(item.command, item.args, { env: { ...process.env, ...(item.env ?? {}) } });
    let output = "";
    let settled = false;
    const timeoutMs = item.timeoutMs ?? 180_000;
    const timer = setTimeout(() => {
      output += `\nGate timed out after ${timeoutMs} ms.\n`;
      terminateProcessTree(child);
      void finish({ exitCode: 1, signal: "TIMEOUT" });
    }, timeoutMs);
    const append = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      output += `\n${safeMessage(error)}\n`;
      void finish({ exitCode: 2, signal: null });
    });
    child.once("exit", (code, signal) => {
      void finish({ exitCode: code ?? 1, signal: signal ?? null });
    });

    async function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await writeFile(logPath, output);
      resolve({ ...result, sha256: digest(output) });
    }
  });
}

function executeFileGate(item, logPath) {
  return new Promise((resolve) => {
    const logFd = openSync(logPath, "w");
    const detached = false;
    const child = spawn(item.command, item.args, {
      env: { ...process.env, ...(item.env ?? {}) },
      detached,
      stdio: ["ignore", logFd, logFd],
    });
    let settled = false;
    const timeoutMs = item.timeoutMs ?? 180_000;
    const timer = setTimeout(() => {
      terminateProcessTree(child, detached);
      void finish({ exitCode: 1, signal: "TIMEOUT" }, `Gate timed out after ${timeoutMs} ms.`);
    }, timeoutMs);

    child.once("error", (error) => {
      void finish({ exitCode: 2, signal: null }, safeMessage(error));
    });
    child.once("exit", (code, signal) => {
      void finish({ exitCode: code ?? 1, signal: signal ?? null });
    });

    async function finish(result, appendedMessage = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSync(logFd);
      let output = "";
      try {
        output = await readFile(logPath, "utf8");
      } catch {
        output = "";
      }
      if (appendedMessage) {
        output += `${output.endsWith("\n") || output.length === 0 ? "" : "\n"}${appendedMessage}\n`;
        await writeFile(logPath, output);
      }
      if (output) process.stdout.write(output);
      resolve({ ...result, sha256: digest(output) });
    }
  });
}

function executeBrowserGate(item, logPath) {
  return new Promise((resolve) => {
    const logFd = openSync(logPath, "w");
    const detached = process.platform !== "win32";
    const child = spawn(item.command, item.args, {
      env: { ...process.env, ...(item.env ?? {}) },
      detached,
      stdio: ["ignore", logFd, logFd],
    });
    let settled = false;
    const timeoutMs = item.timeoutMs ?? 90_000;
    const timer = setTimeout(() => {
      terminateProcessTree(child, detached);
      void finish({ exitCode: 2, signal: "TIMEOUT" }, `Gate timed out after ${timeoutMs} ms.`);
    }, timeoutMs);

    child.once("error", (error) => {
      void finish({ exitCode: 2, signal: null }, safeMessage(error));
    });
    child.once("exit", (code, signal) => {
      void finish({ exitCode: code ?? 1, signal: signal ?? null });
    });

    async function finish(result, appendedMessage = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSync(logFd);
      let output = "";
      try {
        output = await readFile(logPath, "utf8");
      } catch {
        output = "";
      }
      if (appendedMessage) {
        output += `${output.endsWith("\n") || output.length === 0 ? "" : "\n"}${appendedMessage}\n`;
        await writeFile(logPath, output);
      }
      if (output) process.stdout.write(output);
      resolve({ ...result, sha256: digest(output) });
    }
  });
}

function terminateProcessTree(child, detached = false) {
  try {
    if (detached && child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    // The process may already have exited.
  }
}
async function validateConfiguration() {
  const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
  const project = JSON.parse(await readFile("project.config.json", "utf8"));
  if (packageMetadata.version !== project.extensionVersion)
    throw new Error("Package and project versions diverged.");
  for (const target of ["chrome", "edge"]) {
    const manifest = JSON.parse(await readFile(`src/manifest/${target}.json`, "utf8"));
    if (manifest.version !== packageMetadata.version)
      throw new Error(`${target} manifest version diverged.`);
    if (manifest.manifest_version !== 3) throw new Error(`${target} manifest is not Manifest V3.`);
  }
  const requiredFiles = [
    "README.md",
    "GENERATION_MANIFEST.json",
    "build.mjs",
    "playwright.config.ts",
  ];
  for (const file of requiredFiles)
    if (!(await stat(file)).isFile()) throw new Error(`Required release file is absent: ${file}`);
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function commandOutput(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", () => resolve(output.trim()));
    child.once("error", () => resolve("unavailable"));
  });
}
function renderMarkdown(report) {
  const rows = report.commands
    .map((item) => `| ${item.id} | \`${item.command} ${item.args.join(" ")}\` | ${item.exitCode} |`)
    .join("\n");
  return `# Release Gate Results\n\n- Version: ${report.projectVersion}\n- Mode: ${report.mode}\n- Exit code: ${report.exitCode}\n- Browser status: ${report.browser.status}\n- Full two-target release gate passed: ${report.full_release_gate_passed ? "yes" : "no"}\n- Full store readiness declared: no\n\n| Gate | Command | Exit code |\n|---|---|---:|\n${rows}\n`;
}
