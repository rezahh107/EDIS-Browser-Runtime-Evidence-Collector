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
