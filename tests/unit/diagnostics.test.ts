import { describe, expect, it } from "vitest";
import { diagnostic, isDiagnostic } from "../../src/domain/diagnostics";

describe("diagnostics", () => {
  it("creates stable structured diagnostics", () => {
    const value = diagnostic(
      "EDIS_RUNTIME_ELEMENT_LIMIT_REACHED",
      "WARNING",
      "Limit reached.",
      true,
      { limit: 500 },
    );
    expect(isDiagnostic(value)).toBe(true);
    expect(value.context.limit).toBe(500);
  });

  it("records a non-sensitive failure boundary and redacts URL query context", () => {
    const value = diagnostic(
      "EDIS_RUNTIME_BROWSER_QUALIFICATION_FAILED",
      "ERROR",
      "Browser qualification failed.",
      true,
      {
        artifact_zip_sha: "a".repeat(64),
        page_url: "https://example.test/path?token=secret#frag",
        token: "must-not-appear",
      },
      "OPERATIONAL",
      "BROWSER_QUALIFICATION_FAILURE",
    );

    expect(isDiagnostic(value)).toBe(true);
    expect(value.failure_boundary).toBe("BROWSER_QUALIFICATION_FAILURE");
    expect(value.context.page_url).toBe("https://example.test/path?redacted");
    expect(value.context).not.toHaveProperty("token");
  });

  it("rejects arbitrary codes", () => {
    expect(
      isDiagnostic({
        code: "ARBITRARY",
        severity: "WARNING",
        message: "x",
        recoverable: true,
        context: {},
      }),
    ).toBe(false);
  });
});
