import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("readiness export blocker localization", () => {
  it("maps readiness ERROR to localized English and Persian guidance", async () => {
    const [sidepanel, englishSource, persianSource] = await Promise.all([
      readFile("src/sidepanel/index.ts", "utf8"),
      readFile("_locales/en/messages.json", "utf8"),
      readFile("_locales/fa/messages.json", "utf8"),
    ]);
    const english = JSON.parse(englishSource) as Record<string, { message: string }>;
    const persian = JSON.parse(persianSource) as Record<string, { message: string }>;
    const key = "preflightBlockingReadinessError";

    expect(sidepanel).toContain(`EDIS_RUNTIME_READINESS_ERROR: "${key}"`);
    expect(english[key]?.message).toContain("Capture the affected viewport again");
    expect(persian[key]?.message).toContain("نمای آسیب‌دیده را دوباره ثبت کنید");
    expect(english[key]?.message).not.toContain("EDIS_RUNTIME_READINESS_ERROR");
    expect(persian[key]?.message).not.toContain("EDIS_RUNTIME_READINESS_ERROR");
  });
});
