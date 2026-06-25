import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("schemas");
const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
if (files.length === 0) throw new Error("No schema files were found.");
const documents = new Map();
for (const file of files) {
  const value = JSON.parse(await readFile(path.join(directory, file), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${file} is not a JSON object.`);
  documents.set(file, value);
}
const index = documents.get("schema-index.json");
if (!index || !index.data || !Array.isArray(index.data.schemas))
  throw new Error("schema-index.json is invalid.");
const indexed = [...index.data.schemas].map((item) => item.path).sort();
const expected = files.filter((name) => name !== "schema-index.json");
if (JSON.stringify(indexed) !== JSON.stringify(expected))
  throw new Error("schema-index.json does not exactly enumerate schema files.");
const identifiers = new Set();
for (const item of index.data.schemas) {
  if (!item || typeof item !== "object" || typeof item.path !== "string")
    throw new Error("schema-index.json contains an invalid record.");
  const schema = documents.get(item.path);
  if (!schema) throw new Error(`Indexed schema is missing: ${item.path}`);
  if (schema.$id !== item.schema_id)
    throw new Error(
      `Schema identifier mismatch for ${item.path}: ${item.schema_id} != ${schema.$id}`,
    );
  if (identifiers.has(item.schema_id))
    throw new Error(`Duplicate schema identifier: ${item.schema_id}`);
  identifiers.add(item.schema_id);
}
for (const [file, schema] of documents) {
  if (file === "schema-index.json") continue;
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema")
    throw new Error(`${file} does not declare JSON Schema 2020-12.`);
  if (
    typeof schema.$id !== "string" ||
    !(schema.$id.startsWith("urn:edis:") || schema.$id.startsWith("https://edis.local/schemas/"))
  )
    throw new Error(`${file} has an invalid EDIS schema identifier.`);
}
console.log(
  `Validated ${files.length} schema documents, exact index coverage, and ${identifiers.size} unique schema identifiers.`,
);
