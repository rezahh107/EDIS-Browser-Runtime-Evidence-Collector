// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectElements } from "../../src/content/collectors/element";
import { DEFAULT_PREFERENCES, type CaptureConfiguration } from "../../src/domain/model";

const baseConfiguration: CaptureConfiguration = {
  ...DEFAULT_PREFERENCES,
  sessionId: "123e4567-e89b-12d3-a456-426614174000",
  snapshotId: "223e4567-e89b-12d3-a456-426614174000",
  observationIndex: 0,
  userLabel: "Privacy",
  evidenceLabel: "USER_LABELED_VIEWPORT",
  requestedProfileId: "DESKTOP",
  workflowMode: "RUNTIME_EVIDENCE",
  expectedPageFingerprint: null,
  expectedViewportWidth: null,
  capturedAt: "2026-06-13T10:00:00.000Z",
  bindingContext: null,
};

describe("text preview privacy", () => {
  it("keeps previews disabled by default and never reads form-control values", async () => {
    const { text, input, textarea } = fixture();
    const result = await collectElements([text, input, textarea], baseConfiguration);

    expect(result.measurements).toHaveLength(3);
    expect(result.measurements.every((item) => item.text_shape.preview === null)).toBe(true);
    expect(JSON.stringify(result.measurements)).not.toContain("FORM_SECRET");
    expect(JSON.stringify(result.measurements)).not.toContain("TEXTAREA_SECRET");
  });

  it("does not expose descendant form or editable text through an emitted ancestor", async () => {
    document.body.textContent = "";
    const parent = document.createElement("section");
    parent.append("Public label ");
    const textarea = document.createElement("textarea");
    textarea.textContent = "TEXTAREA_DEFAULT_SECRET";
    textarea.value = "TEXTAREA_VALUE_SECRET";
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "EDITABLE_SECRET";
    parent.append(textarea, editable);
    document.body.append(parent);
    for (const element of [parent, textarea, editable]) mockLayout(element);

    const result = await collectElements([parent, textarea, editable], {
      ...baseConfiguration,
      includeTextPreview: true,
      maxTextPreviewChars: 160,
    });

    const serialized = JSON.stringify(result.measurements);
    expect(result.measurements[0]?.text_shape.preview).toContain("Public label");
    expect(serialized).not.toContain("TEXTAREA_DEFAULT_SECRET");
    expect(serialized).not.toContain("TEXTAREA_VALUE_SECRET");
    expect(serialized).not.toContain("EDITABLE_SECRET");
  });

  it("redacts secret-like content and enforces the configured preview limit", async () => {
    const { text, input, textarea } = fixture();
    const result = await collectElements([text, input, textarea], {
      ...baseConfiguration,
      includeTextPreview: true,
      maxTextPreviewChars: 48,
    });

    const preview = result.measurements[0]?.text_shape.preview;
    expect(preview).not.toBeNull();
    expect(preview?.length).toBeLessThanOrEqual(48);
    expect(preview).not.toContain("person@example.com");
    expect(preview).not.toContain("eyJabcdefgh.abcdefgh.abcdefgh");
    expect(preview).toContain("[REDACTED_EMAIL]");
    expect(result.measurements[0]?.text_shape.preview_truncated).toBe(true);
    expect(result.measurements[1]?.text_shape.preview).toBeNull();
    expect(result.measurements[2]?.text_shape.preview).toBeNull();
  });
});

function fixture(): {
  text: HTMLDivElement;
  input: HTMLInputElement;
  textarea: HTMLTextAreaElement;
} {
  document.body.textContent = "";
  const text = document.createElement("div");
  const visibleText =
    "Contact person@example.com token eyJabcdefgh.abcdefgh.abcdefgh and additional bounded words.";
  text.textContent = visibleText;
  Object.defineProperty(text, "innerText", { configurable: true, value: visibleText });
  const input = document.createElement("input");
  input.value = "FORM_SECRET";
  const textarea = document.createElement("textarea");
  textarea.value = "TEXTAREA_SECRET";
  document.body.append(text, input, textarea);
  for (const element of [text, input, textarea]) mockLayout(element);
  return { text, input, textarea };
}

function mockLayout(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      x: 10,
      y: 10,
      top: 10,
      right: 210,
      bottom: 50,
      left: 10,
      width: 200,
      height: 40,
      toJSON: () => ({}),
    }) as DOMRect;
  for (const [name, value] of Object.entries({
    clientWidth: 200,
    clientHeight: 40,
    scrollWidth: 200,
    scrollHeight: 80,
    offsetWidth: 200,
    offsetHeight: 40,
  }))
    Object.defineProperty(element, name, { configurable: true, value });
}
