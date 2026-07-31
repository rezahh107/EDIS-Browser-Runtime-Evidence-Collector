import { writeFile } from "node:fs/promises";
import { buildCanonicalSourceManifest, canonicalManifestText } from "./source-inventory.mjs";

const manifest = await buildCanonicalSourceManifest();
await writeFile("GENERATION_MANIFEST.json", canonicalManifestText(manifest), "utf8");
console.log(`Generated source manifest for ${manifest.files.length} files.`);
