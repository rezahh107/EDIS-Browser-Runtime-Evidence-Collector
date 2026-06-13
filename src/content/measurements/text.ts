import type { RedactionMode, TextEvidence } from "../../domain/model";
import { isSensitiveElement, limitedTextPreview } from "../../domain/redaction";

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
