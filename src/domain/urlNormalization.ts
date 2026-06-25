import { canonicalJsonWithoutFinalNewline } from "./canonical";
import type { HashDigest, UrlLocatorFacts } from "./model";
import { sha256Digest } from "../infrastructure/checksum";

const MAX_URL_LENGTH = 4_096;
const MAX_SEGMENT_LENGTH = 180;
const CREDENTIAL_LIKE =
  /(?:^|[-_.])(token|nonce|secret|password|passwd|auth|session|jwt|key)(?:$|[-_.])/i;
const EMAIL_LIKE = /^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/;
const JWT_LIKE = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}$/;
const HIGH_ENTROPY = /^[A-Za-z0-9_-]{48,}$/;

export interface NormalizedLocatorResult {
  readonly facts: UrlLocatorFacts;
  readonly redacted_segment_count: number;
  readonly rejected_sensitive_url: boolean;
}

export function normalizeUrlLocator(rawUrl: string, sitePathScope = "/"): NormalizedLocatorResult {
  if (rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH)
    throw new Error("URL is outside bounds.");
  const parsed = new URL(rawUrl);
  if (parsed.username || parsed.password) throw new Error("Credential-bearing URLs are rejected.");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("Only HTTP(S) URLs can be normalized.");

  const scheme = parsed.protocol.slice(0, -1).toLowerCase() as "http" | "https";
  const hostAscii = parsed.hostname.toLowerCase();
  const defaultPort =
    (scheme === "http" && parsed.port === "80") || (scheme === "https" && parsed.port === "443");
  const port = parsed.port && !defaultPort ? Number.parseInt(parsed.port, 10) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65_535))
    throw new Error("URL port is invalid.");

  const normalizedPath = normalizePath(parsed.pathname || "/");
  const normalizedScope = normalizeScope(sitePathScope);
  return {
    facts: {
      scheme,
      host_ascii: hostAscii,
      port,
      path: normalizedPath.path,
      site_path_scope: normalizedScope,
    },
    redacted_segment_count: normalizedPath.redactedCount,
    rejected_sensitive_url: false,
  };
}

export async function pageLocatorDigest(facts: UrlLocatorFacts): Promise<HashDigest> {
  return sha256Digest(canonicalJsonWithoutFinalNewline(facts));
}

function normalizePath(pathname: string): { path: string; redactedCount: number } {
  const input = pathname.length > 0 ? pathname : "/";
  const segments = input.split("/");
  let redactedCount = 0;
  const normalized = segments.map((segment) => {
    if (segment.length === 0) return "";
    const decoded = decodeUnreserved(segment);
    const privacyProbe = decodeForPrivacyProbe(decoded);
    if (privacyProbe === null || isSensitiveSegment(privacyProbe)) {
      redactedCount += 1;
      return "[REDACTED_SEGMENT]";
    }
    return uppercaseRetainedEscapes(decoded);
  });
  const joined = normalized.join("/");
  return { path: joined.startsWith("/") ? joined : `/${joined}`, redactedCount };
}

function normalizeScope(scope: string): string {
  if (!scope.startsWith("/") || scope.includes("?") || scope.includes("#")) return "/";
  const result = normalizePath(scope).path;
  return result.endsWith("/") ? result : `${result}/`;
}

function decodeUnreserved(segment: string): string {
  return segment.replace(/%([0-9a-fA-F]{2})/g, (full, hex: string) => {
    const code = Number.parseInt(hex, 16);
    const char = String.fromCharCode(code);
    return /^[A-Za-z0-9._~-]$/.test(char) ? char : full.toUpperCase();
  });
}

function decodeForPrivacyProbe(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function uppercaseRetainedEscapes(segment: string): string {
  return segment.replace(/%[0-9a-fA-F]{2}/g, (match) => match.toUpperCase());
}

function isSensitiveSegment(segment: string): boolean {
  return (
    segment.length > MAX_SEGMENT_LENGTH ||
    EMAIL_LIKE.test(segment) ||
    JWT_LIKE.test(segment) ||
    HIGH_ENTROPY.test(segment) ||
    CREDENTIAL_LIKE.test(segment)
  );
}
