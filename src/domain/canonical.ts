const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number is not serializable.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(source).sort()) {
      if (DANGEROUS_KEYS.has(key)) throw new Error(`Unsafe object key: ${key}`);
      const child = source[key];
      if (child !== undefined) output[key] = canonicalize(child);
    }
    return output;
  }
  throw new Error(`Unsupported canonical value type: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function parseSafeJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return canonicalize(parsed);
}
