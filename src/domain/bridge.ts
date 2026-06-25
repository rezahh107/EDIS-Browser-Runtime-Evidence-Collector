import artifactEnvelopeSchema from "../../schemas/artifact-envelope.schema.json";
import bridgeContextSchema from "../../schemas/bridge-context.schema.json";
import diagnosticSchema from "../../schemas/diagnostic.schema.json";
import { canonicalJson } from "./canonical";
import type {
  BindingContext,
  BridgeDocumentRecord,
  BridgeElementRecord,
  HashDigest,
  ImportedSourceContext,
  ImportedSourceContextData,
  RuntimeAvailability,
  SourceContextReference,
  SourceTruthState,
} from "./model";
import { URL_NORMALIZATION_PROFILE } from "./model";
import { sha256Digest } from "../infrastructure/checksum";
import { isRfc3339DateTime, validateJsonSchema } from "../infrastructure/schemaValidation";

const MAX_CONTEXT_BYTES = 5_000_000;
const MAX_DOCUMENTS = 500;
const MAX_ELEMENTS = 50_000;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 250_000;
const MAX_STRING_LENGTH = 4_096;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const HASH = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ImportedContextRecord {
  readonly context: ImportedSourceContext;
  readonly imported_source_context_sha256: HashDigest;
  readonly selected_document_id: string | null;
  readonly imported_at: string;
  readonly confirmation_state: "NOT_CONFIRMED" | "CONFIRMED";
}

export async function parseImportedSourceContext(
  text: string,
  selectedDocumentId: string | null,
): Promise<ImportedContextRecord> {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_CONTEXT_BYTES) throw new Error("Source Context exceeds the 5 MB limit.");
  assertJsonNestingBound(text, MAX_JSON_DEPTH);
  const parsed: unknown = JSON.parse(text);
  assertImportedTreeBounds(parsed);
  const schemaIssues = validateJsonSchema(parsed, "bridge-context.schema.json", {
    "artifact-envelope.schema.json": artifactEnvelopeSchema,
    "bridge-context.schema.json": bridgeContextSchema,
    "diagnostic.schema.json": diagnosticSchema,
  });
  if (schemaIssues.length > 0 || !isImportedSourceContext(parsed))
    throw new Error(
      `Source Context schema validation failed${schemaIssues[0] ? ` at ${schemaIssues[0].path}` : ""}.`,
    );
  assertBridgeRelationshipIntegrity(parsed, selectedDocumentId);
  const canonical = canonicalJson(parsed);
  if (canonical !== text) throw new Error("Source Context must use EDIS-CJ-1 canonical bytes.");
  const selected = selectDocument(parsed.data.documents, selectedDocumentId);
  return {
    context: parsed,
    imported_source_context_sha256: await sha256Digest(new TextEncoder().encode(canonical)),
    selected_document_id: selected?.document_id ?? null,
    imported_at: new Date().toISOString(),
    confirmation_state: selectedDocumentId === null ? "NOT_CONFIRMED" : "CONFIRMED",
  };
}

export function bindingContextFromRecord(record: ImportedContextRecord): BindingContext {
  const selected =
    record.context.data.documents.find(
      (document) => document.document_id === record.selected_document_id,
    ) ?? null;
  const reference: SourceContextReference = {
    analysis_set_id: record.context.data.analysis_set_id,
    wordpress_bundle_id: record.context.data.wordpress_bundle_id,
    imported_source_context_sha256: record.imported_source_context_sha256,
    source_export_root_sha256: record.context.data.source_export_root_sha256,
    site_fingerprint: record.context.data.site_fingerprint,
    selected_document_id: selected?.document_id ?? null,
    selected_document_fingerprint: selected?.document_fingerprint ?? null,
    confirmation_state: selected ? record.confirmation_state : "NOT_CONFIRMED",
  };
  return {
    reference,
    selected_document: selected,
    documents: record.context.data.documents,
    site_path_scope: record.context.data.site_path_scope,
  };
}

export function isImportedSourceContext(value: unknown): value is ImportedSourceContext {
  if (!isRecord(value)) return false;
  if (
    !onlyKeys(value, [
      "schema_id",
      "schema_version",
      "artifact_type",
      "producer",
      "captured_at",
      "canonicalization",
      "data",
      "diagnostics",
    ])
  )
    return false;
  if (
    value.schema_id !== "urn:edis:schema:wordpress:bridge-context" ||
    value.schema_version !== "1.0.0" ||
    value.artifact_type !== "edis_source_context" ||
    !isRecord(value.producer) ||
    typeof value.producer.product !== "string" ||
    typeof value.producer.version !== "string" ||
    !isRfc3339(value.captured_at) ||
    !isRecord(value.canonicalization) ||
    value.canonicalization.profile !== "EDIS-CJ-1" ||
    value.canonicalization.hash_algorithm !== "sha256" ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length > 1_000 ||
    !isImportedSourceContextData(value.data)
  )
    return false;
  return true;
}

function isImportedSourceContextData(value: unknown): value is ImportedSourceContextData {
  if (!isRecord(value)) return false;
  if (
    !onlyKeys(value, [
      "analysis_set_id",
      "wordpress_bundle_id",
      "source_export_root_sha256",
      "site_fingerprint",
      "url_normalization_profile",
      "site_locator_candidates",
      "multisite_mode",
      "site_path_scope",
      "source_truth_state",
      "source_availability",
      "documents",
    ])
  )
    return false;
  if (
    !(
      value.analysis_set_id === null ||
      (typeof value.analysis_set_id === "string" && UUID_V4.test(value.analysis_set_id))
    ) ||
    typeof value.wordpress_bundle_id !== "string" ||
    !UUID.test(value.wordpress_bundle_id) ||
    !isHash(value.source_export_root_sha256) ||
    !isHash(value.site_fingerprint) ||
    value.url_normalization_profile !== URL_NORMALIZATION_PROFILE ||
    !Array.isArray(value.site_locator_candidates) ||
    !value.site_locator_candidates.every(isHash) ||
    typeof value.multisite_mode !== "string" ||
    typeof value.site_path_scope !== "string" ||
    !isTruthState(value.source_truth_state) ||
    !isAvailability(value.source_availability) ||
    !Array.isArray(value.documents) ||
    value.documents.length > MAX_DOCUMENTS ||
    !value.documents.every(isBridgeDocument)
  )
    return false;
  return value.documents.reduce((sum, item) => sum + item.elements.length, 0) <= MAX_ELEMENTS;
}

function isBridgeDocument(value: unknown): value is BridgeDocumentRecord {
  if (!isRecord(value)) return false;
  if (
    !onlyKeys(value, [
      "document_id",
      "document_type",
      "document_fingerprint",
      "saved_source_sha256",
      "page_locator_candidates",
      "public_routability",
      "source_storage_kind",
      "source_state",
      "architecture_kinds",
      "source_truth_state",
      "source_availability",
      "elements",
    ])
  )
    return false;
  return (
    typeof value.document_id === "string" &&
    value.document_id.length > 0 &&
    value.document_id.length <= 160 &&
    typeof value.document_type === "string" &&
    value.document_type.length <= 120 &&
    isHash(value.document_fingerprint) &&
    isHash(value.saved_source_sha256) &&
    Array.isArray(value.page_locator_candidates) &&
    value.page_locator_candidates.every(isHash) &&
    typeof value.public_routability === "string" &&
    typeof value.source_storage_kind === "string" &&
    typeof value.source_state === "string" &&
    Array.isArray(value.architecture_kinds) &&
    value.architecture_kinds.every((item) => typeof item === "string" && item.length <= 100) &&
    isTruthState(value.source_truth_state) &&
    isAvailability(value.source_availability) &&
    Array.isArray(value.elements) &&
    value.elements.every(isBridgeElement)
  );
}

function isBridgeElement(value: unknown): value is BridgeElementRecord {
  if (!isRecord(value)) return false;
  if (
    !onlyKeys(value, [
      "document_id",
      "source_element_key",
      "source_record_sha256",
      "elementor_element_id",
      "id_occurrence_count",
      "id_uniqueness",
      "parent_elementor_id",
      "ancestor_elementor_ids",
      "source_path",
      "document_order",
      "element_kind",
      "el_type",
      "widget_type",
      "architecture_kind",
      "source_truth_state",
      "source_availability",
      "editor_label",
      "editor_label_source",
    ])
  )
    return false;
  return (
    typeof value.document_id === "string" &&
    isHash(value.source_element_key) &&
    isHash(value.source_record_sha256) &&
    (value.elementor_element_id === null || safeIdentifier(value.elementor_element_id)) &&
    Number.isInteger(value.id_occurrence_count) &&
    Number(value.id_occurrence_count) >= 0 &&
    Number(value.id_occurrence_count) <= 100_000 &&
    ["UNIQUE", "DUPLICATE", "MISSING"].includes(String(value.id_uniqueness)) &&
    (value.parent_elementor_id === null || safeIdentifier(value.parent_elementor_id)) &&
    Array.isArray(value.ancestor_elementor_ids) &&
    value.ancestor_elementor_ids.every(safeIdentifier) &&
    typeof value.source_path === "string" &&
    value.source_path.length <= 2_000 &&
    Number.isInteger(value.document_order) &&
    Number(value.document_order) >= 0 &&
    typeof value.element_kind === "string" &&
    (value.el_type === null || typeof value.el_type === "string") &&
    (value.widget_type === null || typeof value.widget_type === "string") &&
    typeof value.architecture_kind === "string" &&
    (value.editor_label === undefined ||
      value.editor_label === null ||
      (typeof value.editor_label === "string" && value.editor_label.length <= 300)) &&
    (value.editor_label_source === undefined ||
      value.editor_label_source === null ||
      value.editor_label_source === "ELEMENTOR_EDITOR_METADATA") &&
    isTruthState(value.source_truth_state) &&
    isAvailability(value.source_availability)
  );
}

function assertBridgeRelationshipIntegrity(
  context: ImportedSourceContext,
  selectedDocumentId: string | null,
): void {
  const documentIds = new Set<string>();
  for (const document of context.data.documents) {
    if (documentIds.has(document.document_id))
      throw new Error("Source Context contains a duplicate document_id.");
    documentIds.add(document.document_id);
    const sourceElementKeys = new Set<string>();
    for (const element of document.elements) {
      if (element.document_id !== document.document_id)
        throw new Error("Source Context element document_id does not match its parent document.");
      if (sourceElementKeys.has(element.source_element_key))
        throw new Error("Source Context contains a duplicate source_element_key in one document.");
      sourceElementKeys.add(element.source_element_key);
    }
  }
  if (selectedDocumentId !== null && !documentIds.has(selectedDocumentId))
    throw new Error("Selected source document does not exist in the imported Source Context.");
}

function selectDocument(
  documents: readonly BridgeDocumentRecord[],
  requested: string | null,
): BridgeDocumentRecord | null {
  if (requested) return documents.find((document) => document.document_id === requested) ?? null;
  return documents.length === 1 ? (documents[0] ?? null) : null;
}

function isTruthState(value: unknown): value is SourceTruthState {
  return ["VERIFIED", "PARTIAL", "UNKNOWN", "UNSUPPORTED"].includes(String(value));
}
function isAvailability(value: unknown): value is RuntimeAvailability {
  return [
    "AVAILABLE",
    "PARTIAL",
    "INSUFFICIENT",
    "DISABLED",
    "UNAVAILABLE",
    "NOT_APPLICABLE",
    "ERROR",
  ].includes(String(value));
}
function isHash(value: unknown): value is HashDigest {
  return typeof value === "string" && HASH.test(value);
}
function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
}
function isRfc3339(value: unknown): value is string {
  return typeof value === "string" && isRfc3339DateTime(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function assertJsonNestingBound(text: string, maximumDepth: number): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > maximumDepth) throw new Error("Source Context exceeds the JSON nesting limit.");
    } else if (character === "}" || character === "]") depth -= 1;
  }
  if (inString || depth !== 0) throw new Error("Source Context JSON is structurally incomplete.");
}

function assertImportedTreeBounds(root: unknown): void {
  const stack: unknown[] = [root];
  let nodes = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    nodes += 1;
    if (nodes > MAX_JSON_NODES) throw new Error("Source Context exceeds the parsed-node limit.");
    if (typeof value === "string") {
      if (value.length > MAX_STRING_LENGTH)
        throw new Error("Source Context contains an oversized string.");
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    if (isRecord(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (DANGEROUS_KEYS.has(key))
          throw new Error("Source Context contains an unsafe object key.");
        if (key.length > 200) throw new Error("Source Context contains an oversized object key.");
        stack.push(item);
      }
    }
  }
}
