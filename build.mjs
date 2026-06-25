import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const project = JSON.parse(await readFile(path.join(root, "project.config.json"), "utf8"));
const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (project.extensionVersion !== packageMetadata.version)
  throw new Error("project.config.json and package.json versions diverged.");
const argIndex = process.argv.indexOf("--target");
const requested = argIndex >= 0 ? process.argv[argIndex + 1] : project.selectedTarget;
const supported = new Set(["chrome", "edge", "all"]);
if (typeof requested !== "string" || !supported.has(requested))
  throw new Error("Build target must be chrome, edge, or all.");
const targets = requested === "all" ? ["chrome", "edge"] : [requested];

const entries = [
  ["content/index.ts", "content/index.js"],
  ["popup/index.ts", "popup/index.js"],
  ["sidepanel/index.ts", "sidepanel/index.js"],
  ["options/index.ts", "options/index.js"],
  ["guide/index.ts", "guide/index.js"],
];

async function bundleEntry(input, output) {
  await build({
    entryPoints: [path.join(root, "src", input)],
    outfile: path.join(output, outputPath(input)),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome116"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    charset: "utf8",
  });
}

function outputPath(input) {
  const found = entries.find(([source]) => source === input);
  if (!found) throw new Error(`Unknown entry: ${input}`);
  return found[1];
}

async function copyStatic(output) {
  for (const area of ["popup", "sidepanel", "options", "guide"]) {
    await mkdir(path.join(output, area), { recursive: true });
    await cp(path.join(root, "src", area, "index.html"), path.join(output, area, "index.html"));
    await cp(path.join(root, "src", area, "index.css"), path.join(output, area, "index.css"));
  }
  await cp(path.join(root, "src", "shared", "ui.css"), path.join(output, "ui.css"));
  await cp(path.join(root, "src", "assets"), path.join(output, "assets"), { recursive: true });
  await cp(path.join(root, "_locales"), path.join(output, "_locales"), { recursive: true });
  await cp(path.join(root, "schemas"), path.join(output, "schemas"), { recursive: true });
  await cp(path.join(root, "PRIVACY.md"), path.join(output, "PRIVACY.md"));
  await cp(path.join(root, "HELP.md"), path.join(output, "HELP.md"));
  await cp(path.join(root, "HELP_FA.md"), path.join(output, "HELP_FA.md"));
}

async function buildTarget(target) {
  const output = path.join(root, "dist", target);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [input] of entries) await bundleEntry(input, output);

  const exportWorkerOutput = path.join(output, "workers", "export-worker.js");
  await mkdir(path.dirname(exportWorkerOutput), { recursive: true });
  await build({
    entryPoints: [path.join(root, "src", "workers", "exportWorker.ts")],
    outfile: exportWorkerOutput,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome116"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    charset: "utf8",
  });

  const backgroundOutput = path.join(output, "background", "service-worker.js");
  await mkdir(path.dirname(backgroundOutput), { recursive: true });
  await build({
    entryPoints: [path.join(root, "src", "background", "index.ts")],
    outfile: backgroundOutput,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome116"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    charset: "utf8",
  });
  await copyStatic(output);
  const manifest = JSON.parse(
    await readFile(path.join(root, "src", "manifest", `${target}.json`), "utf8"),
  );
  if (manifest.version !== project.extensionVersion)
    throw new Error(`${target} manifest version diverged from project configuration.`);
  await writeFile(
    path.join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

for (const target of targets) await buildTarget(target);
