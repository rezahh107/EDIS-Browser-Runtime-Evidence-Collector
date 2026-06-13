import type { RedactionMode } from "./model";

const SENSITIVE_PATTERN =
  /(password|passwd|passcode|token|secret|auth|login|credit|card|cc-number|cvv|cvc|iban|ssn|message|chat)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const RANDOM_TOKEN = /^(?:[a-f0-9]{16,}|[A-Za-z0-9_-]{24,})$/;

export function normalizeUrl(
  raw: string,
  includePath: boolean,
): { origin: string; path: string | null } {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Unsupported URL protocol.");
  return {
    origin: url.origin.toLowerCase(),
    path: includePath ? normalizePath(url.pathname) : null,
  };
}

export function normalizePath(path: string): string {
  const compact = path.replace(/\/{2,}/g, "/");
  return compact.length > 1 && compact.endsWith("/") ? compact.slice(0, -1) : compact || "/";
}

export function isSensitiveElement(element: Element): boolean {
  const attributes = ["type", "name", "id", "autocomplete", "aria-label", "placeholder"];
  const joined = attributes.map((name) => element.getAttribute(name) ?? "").join(" ");
  return SENSITIVE_PATTERN.test(joined) || element.matches("input, textarea, select, option");
}

export function sanitizeClassTokens(
  tokens: readonly string[],
  mode: RedactionMode,
): readonly string[] {
  const unique = new Set<string>();
  for (const token of tokens) {
    const value = token.trim();
    if (
      !value ||
      value.length > 64 ||
      !/^[A-Za-z0-9_-]+$/.test(value) ||
      EMAIL_PATTERN.test(value) ||
      JWT_PATTERN.test(value) ||
      RANDOM_TOKEN.test(value)
    )
      continue;
    if (SENSITIVE_PATTERN.test(value)) continue;
    if (
      mode === "STRICT" &&
      !/^(elementor|e-|widget|section|container|grid|flex|button|heading|image|menu|nav)/i.test(
        value,
      )
    )
      continue;
    unique.add(value);
    if (unique.size >= 20) break;
  }
  return [...unique].sort();
}

export function limitedTextPreview(text: string, maxLength: number): string {
  const normalized = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(JWT_PATTERN, "[redacted-token]");
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function stableIdCandidate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 80 ||
    RANDOM_TOKEN.test(trimmed) ||
    SENSITIVE_PATTERN.test(trimmed)
  )
    return null;
  return /^[A-Za-z][A-Za-z0-9_:-]*$/.test(trimmed) ? trimmed : null;
}
