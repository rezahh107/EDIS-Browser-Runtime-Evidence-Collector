import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("side-panel workflow default", () => {
  it("defaults new sessions to ordinary runtime evidence", async () => {
    const html = await readFile("src/sidepanel/index.html", "utf8");
    const selectMatch = /<select id="workflow-mode">([\s\S]*?)<\/select>/.exec(html);
    expect(selectMatch).not.toBeNull();
    const selectedOption = /<option\s+value="([^"]+)"[^>]*\sselected(?:\s|>)/.exec(
      selectMatch?.[1] ?? "",
    );
    expect(selectedOption?.[1]).toBe("RUNTIME_EVIDENCE");
  });
});
