import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const artifactRoot = path.resolve("artifacts/reproducibility");
const first = path.join(artifactRoot, "first");
const second = path.join(artifactRoot, "second");
await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });

await run("node", ["build.mjs", "--target", "all"]);
await run("node", ["scripts/package-release.mjs"]);
await cp("dist", path.join(first, "dist"), { recursive: true });
await cp("artifacts/packages", path.join(first, "packages"), { recursive: true });
await run("node", ["build.mjs", "--target", "all"]);
await run("node", ["scripts/package-release.mjs"]);
await cp("dist", path.join(second, "dist"), { recursive: true });
await cp("artifacts/packages", path.join(second, "packages"), { recursive: true });

const firstInventory = await inventory(first);
const secondInventory = await inventory(second);
const mismatches = [];
for (const key of new Set([...firstInventory.keys(), ...secondInventory.keys()])) {
  const a = firstInventory.get(key);
  const b = secondInventory.get(key);
  if (!a || !b || a.sha256 !== b.sha256 || a.bytes !== b.bytes)
    mismatches.push({ path: key, first: a ?? null, second: b ?? null });
}
const report = {
  result: mismatches.length === 0 ? "PASS" : "FAIL",
  firstFileCount: firstInventory.size,
  secondFileCount: secondInventory.size,
  mismatches,
};
await writeFile(
  path.join(artifactRoot, "reproducibility.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(artifactRoot, "reproducibility.md"),
  `# Reproducible Build Report\n\n- Result: **${report.result}**\n- First files: ${report.firstFileCount}\n- Second files: ${report.secondFileCount}\n- Mismatches: ${mismatches.length}\n`,
);
if (mismatches.length > 0)
  throw new Error(`Reproducible build failed for ${mismatches.length} files.`);
console.log(
  `Reproducible build passed for ${firstInventory.size} files, including production ZIP bytes.`,
);

async function inventory(root) {
  const output = new Map();
  for (const file of await walk(root)) {
    const data = await readFile(file);
    output.set(path.relative(root, file).replaceAll(path.sep, "/"), {
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
  return output;
}
async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(target)));
    else output.push(target);
  }
  return output.sort();
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}.`)),
    );
  });
}
