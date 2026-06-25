import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  E2E_UNAVAILABLE_MARKER,
  artifactDirectory,
  preflightExtension,
  requestedBrowser,
  requestedHeadless,
  resolveExecutableEvidence,
} from "./e2e-environment.mjs";

const browser = requestedBrowser();
const headless = requestedHeadless();
const artifacts = artifactDirectory();
let executableEvidence = null;
await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

try {
  executableEvidence = await resolveExecutableEvidence(browser);
  const preflight = await preflightExtension({
    browser,
    headless,
    executablePath: executableEvidence.path,
    executableEvidence,
  });
  const playwrightArguments = ["playwright", "test"];
  const testFile = optionValue("--test-file");
  const grep = optionValue("--grep");
  if (testFile) playwrightArguments.push(testFile);
  if (grep) playwrightArguments.push("--grep", grep);
  if (process.argv.includes("--debug")) playwrightArguments.push("--debug");
  const code = await run(
    process.execPath,
    [path.resolve("node_modules/playwright/cli.js"), ...playwrightArguments.slice(1)],
    {
      ...process.env,
      EDIS_E2E_BROWSER: browser,
      EDIS_E2E_HEADLESS: String(headless),
      EDIS_E2E_RESOLVED_EXECUTABLE_PATH: executableEvidence.path,
      EDIS_E2E_ARTIFACT_DIR: artifacts,
      EDIS_E2E_EXTENSION_PATH: preflight.extensionPath,
    },
  );
  process.exit(code);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await writeFile(path.join(artifacts, "environment-unavailable.txt"), `${message}\n`, "utf8");
  await writeFile(
    path.join(artifacts, "environment-unavailable.json"),
    `${JSON.stringify(
      {
        schema_version: "1.1.0",
        status: "INSUFFICIENT_EVIDENCE",
        requested_target: browser,
        headless,
        executable_path: executableEvidence?.path ? sanitizePath(executableEvidence.path) : null,
        executable_source: executableEvidence?.source ?? null,
        executable_sha256: executableEvidence?.executable_sha256 ?? null,
        browser_family: executableEvidence?.browser_family ?? null,
        browser_version_command: executableEvidence?.version_command ?? null,
        qualification_scope: executableEvidence?.qualification_scope ?? null,
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        os: `${os.type()} ${os.release()}`,
        reason: message,
        failure_boundary: "BROWSER_QUALIFICATION_FAILURE",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.error(message);
  process.exit(message.includes(E2E_UNAVAILABLE_MARKER) ? 2 : 1);
}

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", (error) => {
      console.error(error);
      resolve(2);
    });
    child.once("exit", (code, signal) => {
      if (signal) console.error(`Playwright terminated by signal ${signal}.`);
      resolve(code ?? 1);
    });
  });
}

function sanitizePath(value) {
  const home = os.homedir();
  return home && value.startsWith(home) ? value.replace(home, "<HOME>") : value;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
