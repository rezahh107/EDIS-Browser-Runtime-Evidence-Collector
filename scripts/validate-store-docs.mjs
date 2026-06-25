import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const required = [
  "store/chrome/listing/short-description.txt",
  "store/chrome/listing/detailed-description.md",
  "store/chrome/listing/single-purpose-statement.md",
  "store/chrome/listing/category-recommendation.md",
  "store/chrome/listing/supported-languages.md",
  `store/chrome/listing/release-notes-${version}.md`,
  "store/chrome/privacy/privacy-practices-draft.md",
  "store/chrome/privacy/data-use-declaration.md",
  "store/chrome/privacy/local-only-statement.md",
  "store/chrome/privacy/remote-code-declaration.md",
  "store/chrome/privacy/permission-declarations.md",
  "store/chrome/privacy/privacy-policy-publication-guide.md",
  "store/chrome/reviewer/reviewer-instructions.md",
  "store/chrome/reviewer/test-fixture-guide.md",
  "store/chrome/reviewer/expected-results.md",
  "store/chrome/reviewer/known-limitations.md",
  "store/chrome/support/support-page-template.md",
  "store/chrome/support/issue-report-template.md",
  "store/chrome/support/troubleshooting-for-users.md",
  "store/chrome/assets/screenshot-plan.md",
  "store/chrome/assets/promotional-assets-specification.md",
  "store/chrome/assets/asset-checklist.md",
  "store/chrome/release/submission-checklist.md",
  "store/chrome/release/release-evidence-index.md",
  "store/chrome/release/rollback-plan.md",
  "docs/manual-compatibility-test-plan.md",
  "docs/manual-compatibility-results-template.md",
];
const placeholders = new Set([
  "PRIVACY_POLICY_PUBLIC_URL_REQUIRED",
  "SUPPORT_PUBLIC_URL_REQUIRED",
  "DEVELOPER_CONTACT_REQUIRED",
  "STORE_ACCOUNT_REQUIRED",
]);
for (const file of required) {
  const metadata = await stat(path.resolve(file));
  if (!metadata.isFile() || metadata.size === 0)
    throw new Error(`Required document is empty: ${file}`);
}
const productionRoots = ["src", "_locales", "schemas"];
for (const root of productionRoots) {
  for (const file of await walk(root)) {
    const text = await readFile(file, "utf8").catch(() => "");
    for (const placeholder of placeholders)
      if (text.includes(placeholder))
        throw new Error(`Administrative placeholder leaked into ${file}.`);
  }
}
const short = (await readFile("store/chrome/listing/short-description.txt", "utf8")).trim();
if (short.length === 0 || short.length > 132)
  throw new Error(`Chrome short description must be 1-132 characters; found ${short.length}.`);
console.log(
  `Validated ${required.length} store/manual documents and production placeholder isolation.`,
);

async function walk(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(target)));
    else output.push(target);
  }
  return output;
}
