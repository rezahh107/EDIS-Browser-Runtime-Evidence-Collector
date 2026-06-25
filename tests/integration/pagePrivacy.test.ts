// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectPageEvidence } from "../../src/content/collectors/page";

describe("page locator privacy", () => {
  it("preserves locator matching hashes while withholding raw path facts by default", async () => {
    history.replaceState({}, "", "/private/account/settings?token=secret#fragment");
    const page = await collectPageEvidence(
      false,
      false,
      "STRICT",
      {
        browser_family: "Chrome",
        browser_version: "1",
        platform_category: "DESKTOP",
      },
      null,
    );
    expect(page.path).toBeNull();
    expect(page.locator_facts).toBeNull();
    expect(page.locator_disclosure).toBe("HASH_ONLY");
    expect(page.page_locator_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
