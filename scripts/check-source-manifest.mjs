import { readFile } from "node:fs/promises";
import { buildCanonicalSourceManifest, canonicalManifestText } from "./source-inventory.mjs";

const expected = canonicalManifestText(await buildCanonicalSourceManifest());
const committed = await readFile("GENERATION_MANIFEST.json", "utf8");
if (committed !== expected) {
  throw new Error(
    "Committed GENERATION_MANIFEST.json is stale. Run `npm run manifest:source` and commit the result.",
  );
}
console.log("Committed source manifest matches the current workspace.");
