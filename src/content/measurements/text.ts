import type { RedactionMode } from "../../domain/model";

export interface TextEvidence {
  readonly text_length: number | null;
  readonly estimated_line_count: number | null;
  readonly truncated: boolean;
  readonly heading_level: number | null;
  readonly accessible_name_status: "PRESENT" | "ABSENT" | "REDACTED" | "NOT_APPLICABLE";
  readonly preview: string | null;
}

const SENSITIVE_PATTERN =
  /(password|passwd|passcode|token|secret|auth|login|credit|card|cc-number|cvv|cvc|iban|ssn|message|chat)/i;

export function collectTextEvidence(
  element: Element,
  includePreview: boolean,
  maxPreviewLength: number,
  mode: RedactionMode,
): TextEvidence {
  const heading = /^H([1-6])$/.exec(element.tagName);
  const sensitive =
    isSensitiveElement(element) || (element instanceof HTMLElement && element.isContentEditable);
  const text = sensitive ? "" : (element.textContent ?? "");
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  const rect = element.getBoundingClientRect();
  const estimated =
    Number.isFinite(lineHeight) && lineHeight > 0
      ? Math.max(0, Math.round(rect.height / lineHeight))
      : null;
  const html = element instanceof HTMLElement ? element : null;
  const truncated = html
    ? html.scrollWidth > html.clientWidth + 1 ||
      html.scrollHeight > html.clientHeight + 1 ||
      style.textOverflow === "ellipsis"
    : false;
  const ariaLabelPresent =
    element.hasAttribute("aria-label") &&
    (element.getAttribute("aria-label") ?? "").trim().length > 0;
  const hasText = text.trim().length > 0;
  const accessibleStatus = sensitive
    ? "REDACTED"
    : ariaLabelPresent || hasText
      ? "PRESENT"
      : "ABSENT";
  const mayPreview = includePreview && mode !== "STRICT" && !sensitive;
  return {
    text_length: sensitive ? null : text.length,
    estimated_line_count: sensitive ? null : estimated,
    truncated,
    heading_level: heading?.[1] ? Number(heading[1]) : null,
    accessible_name_status: accessibleStatus,
    preview: mayPreview ? limitedTextPreview(text, maxPreviewLength) : null,
  };
}

function isSensitiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const html = element instanceof HTMLElement ? element : null;
  const input = element instanceof HTMLInputElement ? element : null;
  const type = input?.type.toLowerCase() ?? "";
  const name = html?.getAttribute("name") ?? "";
  const id = html?.id ?? "";
  const autocomplete = html?.getAttribute("autocomplete") ?? "";
  const ariaLabel = html?.getAttribute("aria-label") ?? "";
  return (
    tagName === "textarea" ||
    tagName === "select" ||
    type === "password" ||
    type === "email" ||
    type === "tel" ||
    type === "search" ||
    type === "url" ||
    SENSITIVE_PATTERN.test(type) ||
    SENSITIVE_PATTERN.test(name) ||
    SENSITIVE_PATTERN.test(id) ||
    SENSITIVE_PATTERN.test(autocomplete) ||
    SENSITIVE_PATTERN.test(ariaLabel)
  );
}

function limitedTextPreview(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (maxLength <= 0) return "";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}…`;
}
