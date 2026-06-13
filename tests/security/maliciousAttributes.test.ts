// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildElementIdentity } from "../../src/domain/identity";
import { limitedTextPreview } from "../../src/domain/redaction";

describe("malicious attributes and XSS strings", () => {
  it("treats payloads as data and redacts unstable classes", () => {
    const element = document.createElement("div");
    element.className = 'elementor-widget "><img src=x onerror=alert(1)>';
    document.body.append(element);
    const identity = buildElementIdentity(element, "STANDARD");
    expect(identity.class_tokens).toContain("elementor-widget");
    expect(identity.class_tokens.join(" ")).not.toContain("onerror");
  });

  it("does not execute preview payloads", () => {
    expect(limitedTextPreview("<script>globalThis.pwned=true</script>", 100)).toContain("<script>");
    expect(globalThis).not.toHaveProperty("pwned");
  });
});
