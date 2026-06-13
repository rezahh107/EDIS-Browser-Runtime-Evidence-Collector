import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const project = JSON.parse(await readFile(path.join(root, "project.config.json"), "utf8"));
const argIndex = process.argv.indexOf("--target");
const requested = argIndex >= 0 ? process.argv[argIndex + 1] : project.selectedTarget;
const supported = new Set(["chrome", "edge", "firefox", "all"]);
if (typeof requested !== "string" || !supported.has(requested)) {
  throw new Error("Build target must be chrome, edge, firefox, or all.");
}
const targets = requested === "all" ? ["chrome", "edge", "firefox"] : [requested];

const entries = [
  ["content/index.ts", "content/index.js"],
  ["popup/index.ts", "popup/index.js"],
  ["sidepanel/index.ts", "sidepanel/index.js"],
  ["options/index.ts", "options/index.js"],
];

async function bundleEntry(input, output, target) {
  await build({
    entryPoints: [path.join(root, "src", input)],
    outfile: path.join(output, outputPath(input)),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: target === "firefox" ? ["firefox126"] : ["chrome116"],
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
  for (const area of ["popup", "sidepanel", "options"]) {
    await mkdir(path.join(output, area), { recursive: true });
    await cp(path.join(root, "src", area, "index.html"), path.join(output, area, "index.html"));
    await cp(path.join(root, "src", area, "index.css"), path.join(output, area, "index.css"));
  }
  await cp(path.join(root, "src", "shared", "ui.css"), path.join(output, "ui.css"));
  await cp(path.join(root, "src", "assets"), path.join(output, "assets"), { recursive: true });
  await cp(path.join(root, "_locales"), path.join(output, "_locales"), { recursive: true });
  await cp(path.join(root, "schemas"), path.join(output, "schemas"), { recursive: true });
}

async function buildTarget(target) {
  const output = path.join(root, "dist", target);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [input] of entries) await bundleEntry(input, output, target);

  const backgroundOutput =
    target === "firefox"
      ? path.join(output, "background", "background.js")
      : path.join(output, "background", "service-worker.js");
  await mkdir(path.dirname(backgroundOutput), { recursive: true });
  await build({
    entryPoints: [path.join(root, "src", "background", "index.ts")],
    outfile: backgroundOutput,
    bundle: true,
    format: target === "firefox" ? "iife" : "esm",
    platform: "browser",
    target: target === "firefox" ? ["firefox126"] : ["chrome116"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    charset: "utf8",
  });
  await copyStatic(output);
  const manifest = JSON.parse(
    await readFile(path.join(root, "src", "manifest", `${target}.json`), "utf8"),
  );
  await writeFile(
    path.join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

for (const target of targets) await buildTarget(target);
