const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const CANONICALIZATION_PROFILE = "EDIS-CJ-1";
export const MAX_CANONICAL_DEPTH = 128;
export const MAX_CANONICAL_NODES = 1_000_000;
export const MAX_CANONICAL_COLLECTION_ENTRIES = 100_000;

export type CanonicalizationErrorCode =
  | "EDIS_CANONICAL_CYCLE"
  | "EDIS_CANONICAL_DEPTH_LIMIT"
  | "EDIS_CANONICAL_NODE_LIMIT"
  | "EDIS_CANONICAL_COLLECTION_LIMIT"
  | "EDIS_CANONICAL_NON_FINITE_NUMBER"
  | "EDIS_CANONICAL_UNSAFE_INTEGER"
  | "EDIS_CANONICAL_UNSAFE_KEY"
  | "EDIS_CANONICAL_UNDEFINED"
  | "EDIS_CANONICAL_UNSUPPORTED_TYPE"
  | "EDIS_CANONICAL_INVALID_UNICODE";

export class CanonicalizationError extends TypeError {
  readonly code: CanonicalizationErrorCode;

  constructor(code: CanonicalizationErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "CanonicalizationError";
    this.code = code;
  }
}

interface CanonicalizationState {
  activeAncestors: WeakSet<object>;
  visitedNodes: number;
}

export function canonicalize(value: unknown): unknown {
  return canonicalizeValue(value, 0, {
    activeAncestors: new WeakSet(),
    visitedNodes: 0,
  });
}

function canonicalizeValue(value: unknown, depth: number, state: CanonicalizationState): unknown {
  state.visitedNodes += 1;
  if (state.visitedNodes > MAX_CANONICAL_NODES)
    throw new CanonicalizationError(
      "EDIS_CANONICAL_NODE_LIMIT",
      `maximum visited nodes is ${MAX_CANONICAL_NODES}`,
    );
  if (depth > MAX_CANONICAL_DEPTH)
    throw new CanonicalizationError(
      "EDIS_CANONICAL_DEPTH_LIMIT",
      `maximum depth is ${MAX_CANONICAL_DEPTH}`,
    );

  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new CanonicalizationError("EDIS_CANONICAL_NON_FINITE_NUMBER");
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      throw new CanonicalizationError("EDIS_CANONICAL_UNSAFE_INTEGER");
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === undefined) throw new CanonicalizationError("EDIS_CANONICAL_UNDEFINED");
  if (typeof value !== "object")
    throw new CanonicalizationError("EDIS_CANONICAL_UNSUPPORTED_TYPE", typeof value);

  if (state.activeAncestors.has(value)) throw new CanonicalizationError("EDIS_CANONICAL_CYCLE");
  state.activeAncestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_CANONICAL_COLLECTION_ENTRIES)
        throw new CanonicalizationError(
          "EDIS_CANONICAL_COLLECTION_LIMIT",
          `array length ${value.length} exceeds ${MAX_CANONICAL_COLLECTION_ENTRIES}`,
        );
      return value.map((item) => canonicalizeValue(item, depth + 1, state));
    }

    const source = value as Record<string, unknown>;
    const keys = Object.keys(source).sort(compareCanonicalStrings);
    if (keys.length > MAX_CANONICAL_COLLECTION_ENTRIES)
      throw new CanonicalizationError(
        "EDIS_CANONICAL_COLLECTION_LIMIT",
        `object key count ${keys.length} exceeds ${MAX_CANONICAL_COLLECTION_ENTRIES}`,
      );
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key))
        throw new CanonicalizationError("EDIS_CANONICAL_UNSAFE_KEY", key);
      const child = source[key];
      if (child === undefined)
        throw new CanonicalizationError("EDIS_CANONICAL_UNDEFINED", `key ${key}`);
      output[key] = canonicalizeValue(child, depth + 1, state);
    }
    return output;
  } finally {
    state.activeAncestors.delete(value);
  }
}

/** EDIS-CJ-1 serializer. Unicode is preserved exactly as supplied; no NFC/NFD normalization occurs. */
export function canonicalJson(value: unknown): string {
  return `${serializeCanonical(canonicalize(value))}\n`;
}

export function canonicalJsonWithoutFinalNewline(value: unknown): string {
  return serializeCanonical(canonicalize(value));
}

export function parseSafeJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return canonicalize(parsed);
}

export function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function semanticArtifact(value: unknown): unknown {
  return stripOperationalFields(canonicalize(value));
}

export function canonicalSemanticJson(value: unknown): string {
  return canonicalJson(semanticArtifact(value));
}

function stripOperationalFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripOperationalFields);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort(compareCanonicalStrings)) {
    if (
      [
        "captured_at",
        "created_at",
        "confirmed_at",
        "imported_at",
        "analysis_set_id",
        "wordpress_bundle_id",
        "runtime_bundle_id",
        "session_id",
        "snapshot_id",
        "observation_set_id",
        "observation_index",
        "sample_count",
        "settle_duration_ms",
      ].includes(key)
    )
      continue;
    const child = value[key];
    if (key === "diagnostics" && Array.isArray(child)) {
      output[key] = child
        .filter(isSemanticDiagnosticRecord)
        .map((item) => ({
          code: item.code,
          severity: item.severity,
          scope: item.scope,
          context: stripOperationalFields(item.context),
        }))
        .sort((left, right) =>
          compareCanonicalStrings(serializeCanonical(left), serializeCanonical(right)),
        );
      continue;
    }
    output[key] = stripOperationalFields(child);
  }
  return output;
}

function serializeCanonical(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return serializeString(value);
  if (typeof value === "number") return serializeNumber(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  if (isRecord(value)) {
    const pairs = Object.keys(value)
      .sort(compareCanonicalStrings)
      .map((key) => `${serializeString(key)}:${serializeCanonical(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  throw new CanonicalizationError("EDIS_CANONICAL_UNSUPPORTED_TYPE", typeof value);
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) throw new CanonicalizationError("EDIS_CANONICAL_NON_FINITE_NUMBER");
  if (Object.is(value, -0)) return "0";
  return value.toString().replace("E", "e").replace(/e\+/, "e");
}

function serializeString(value: string): string {
  let output = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff))
        throw new CanonicalizationError(
          "EDIS_CANONICAL_INVALID_UNICODE",
          "unpaired high surrogate",
        );
      output += value[index] ?? "";
      output += value[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff)
      throw new CanonicalizationError("EDIS_CANONICAL_INVALID_UNICODE", "unpaired low surrogate");
    switch (code) {
      case 0x22:
        output += '\\"';
        break;
      case 0x5c:
        output += "\\\\";
        break;
      case 0x08:
        output += "\\b";
        break;
      case 0x09:
        output += "\\t";
        break;
      case 0x0a:
        output += "\\n";
        break;
      case 0x0c:
        output += "\\f";
        break;
      case 0x0d:
        output += "\\r";
        break;
      default:
        if (code < 0x20) output += `\\u${code.toString(16).padStart(4, "0")}`;
        else output += value[index] ?? "";
    }
  }
  return `${output}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSemanticDiagnosticRecord(
  value: unknown,
): value is { code: string; severity: string; scope: "SEMANTIC"; context: unknown } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.severity === "string" &&
    value.scope === "SEMANTIC" &&
    Object.hasOwn(value, "context")
  );
}
