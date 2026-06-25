export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

export type SchemaRegistry = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATTERN_CACHE = new Map<string, RegExp | null>();

export function validateJsonSchema(
  value: unknown,
  schemaName: string,
  registry: SchemaRegistry,
): readonly SchemaIssue[] {
  const schema = registry[schemaName];
  if (!isRecord(schema)) return [{ path: "$", message: `Schema not found: ${schemaName}` }];
  const issues: SchemaIssue[] = [];
  validateNode(value, schema, "$", registry, issues, 0);
  return issues;
}

function validateNode(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  registry: SchemaRegistry,
  issues: SchemaIssue[],
  depth: number,
): void {
  if (depth > 128) {
    issues.push({ path, message: "Schema validation exceeded the recursion limit." });
    return;
  }

  if (typeof schema.$ref === "string") {
    const referenced = registry[schema.$ref];
    if (!isRecord(referenced)) {
      issues.push({ path, message: `Unresolved schema reference: ${schema.$ref}` });
      return;
    }
    validateNode(value, referenced, path, registry, issues, depth + 1);
  }

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) {
      if (isRecord(child)) validateNode(value, child, path, registry, issues, depth + 1);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const alternatives = schema.anyOf.filter(isRecord);
    const matched = alternatives.some((child) => {
      const local: SchemaIssue[] = [];
      validateNode(value, child, path, registry, local, depth + 1);
      return local.length === 0;
    });
    if (!matched) issues.push({ path, message: "Value does not match anyOf alternatives." });
  }

  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const))
    issues.push({ path, message: "Value does not match const." });

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(item, value)))
    issues.push({ path, message: "Value is not in enum." });

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    issues.push({ path, message: `Value does not match type ${JSON.stringify(schema.type)}.` });
    return;
  }

  if (typeof value === "string") validateString(value, schema, path, issues);
  if (typeof value === "number") validateNumber(value, schema, path, issues);
  if (Array.isArray(value)) validateArray(value, schema, path, registry, issues, depth);
  if (isRecord(value)) validateObject(value, schema, path, registry, issues, depth);
}

function validateString(
  value: string,
  schema: Record<string, unknown>,
  path: string,
  issues: SchemaIssue[],
): void {
  if (typeof schema.minLength === "number" && value.length < schema.minLength)
    issues.push({ path, message: `String is shorter than ${schema.minLength}.` });
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
    issues.push({ path, message: `String is longer than ${schema.maxLength}.` });
  if (typeof schema.pattern === "string") {
    const pattern = compiledPattern(schema.pattern);
    if (pattern === null) issues.push({ path, message: "Schema contains an invalid pattern." });
    else if (!pattern.test(value)) issues.push({ path, message: "String does not match pattern." });
  }
  if (schema.format === "uuid" && !UUID.test(value))
    issues.push({ path, message: "String is not a UUID." });
  if (schema.format === "date-time" && !isRfc3339DateTime(value))
    issues.push({ path, message: "String is not an RFC3339 date-time." });
}

function validateNumber(
  value: number,
  schema: Record<string, unknown>,
  path: string,
  issues: SchemaIssue[],
): void {
  if (!Number.isFinite(value)) {
    issues.push({ path, message: "Number is not finite." });
    return;
  }
  if (typeof schema.minimum === "number" && value < schema.minimum)
    issues.push({ path, message: `Number is below ${schema.minimum}.` });
  if (typeof schema.maximum === "number" && value > schema.maximum)
    issues.push({ path, message: `Number exceeds ${schema.maximum}.` });
}

function validateArray(
  value: readonly unknown[],
  schema: Record<string, unknown>,
  path: string,
  registry: SchemaRegistry,
  issues: SchemaIssue[],
  depth: number,
): void {
  if (typeof schema.minItems === "number" && value.length < schema.minItems)
    issues.push({ path, message: `Array has fewer than ${schema.minItems} items.` });
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    issues.push({ path, message: `Array has more than ${schema.maxItems} items.` });
  if (schema.uniqueItems === true) {
    const seen = new Set<string>();
    for (const [index, item] of value.entries()) {
      const key = stableValueKey(item);
      if (seen.has(key)) {
        issues.push({ path: `${path}[${index}]`, message: "Array items must be unique." });
        break;
      }
      seen.add(key);
    }
  }
  if (isRecord(schema.items)) {
    for (const [index, item] of value.entries())
      validateNode(item, schema.items, `${path}[${index}]`, registry, issues, depth + 1);
  }
}

function validateObject(
  value: Record<string, unknown>,
  schema: Record<string, unknown>,
  path: string,
  registry: SchemaRegistry,
  issues: SchemaIssue[],
  depth: number,
): void {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === "string" && !Object.hasOwn(value, key))
        issues.push({ path: `${path}.${key}`, message: "Required property is missing." });
    }
  }

  for (const [key, item] of Object.entries(value)) {
    const child = properties[key];
    if (isRecord(child)) {
      validateNode(item, child, `${path}.${key}`, registry, issues, depth + 1);
      continue;
    }
    if (schema.additionalProperties === false) {
      issues.push({ path: `${path}.${key}`, message: "Additional property is not allowed." });
      continue;
    }
    if (isRecord(schema.additionalProperties))
      validateNode(
        item,
        schema.additionalProperties,
        `${path}.${key}`,
        registry,
        issues,
        depth + 1,
      );
  }
}

function matchesType(value: unknown, expected: unknown): boolean {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    switch (type) {
      case "null":
        return value === null;
      case "object":
        return isRecord(value);
      case "array":
        return Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      default:
        return false;
    }
  });
}

export function isRfc3339DateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maximumDay) return false;
  const zone = match[8];
  if (zone === undefined) return false;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function compiledPattern(source: string): RegExp | null {
  if (PATTERN_CACHE.has(source)) return PATTERN_CACHE.get(source) ?? null;
  try {
    const pattern = new RegExp(source, "u");
    PATTERN_CACHE.set(source, pattern);
    return pattern;
  } catch {
    PATTERN_CACHE.set(source, null);
    return null;
  }
}

function stableValueKey(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return `s:${value.length}:${value}`;
    case "number":
      return Object.is(value, -0) ? "n:-0" : `n:${String(value)}`;
    case "boolean":
      return value ? "b:1" : "b:0";
    case "undefined":
      return "u";
    case "bigint":
      return `i:${value.toString()}`;
    case "symbol":
      return `y:${value.description ?? ""}`;
    case "function":
      return `f:${value.name}`;
    case "object":
      if (Array.isArray(value))
        return `a:${value.length}:[${value.map((item) => stableValueKey(item)).join(",")}]`;
      if (isRecord(value)) {
        const keys = Object.keys(value).sort();
        return `o:${keys.length}:{${keys
          .map((key) => `${key.length}:${key}=${stableValueKey(value[key])}`)
          .join(",")}}`;
      }
      return `x:${Object.prototype.toString.call(value)}`;
  }
  return "unknown";
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
    );
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]))
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
