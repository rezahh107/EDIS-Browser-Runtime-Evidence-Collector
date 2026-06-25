import { describe, expect, it } from "vitest";
import { buildEvidencePackage } from "../../src/infrastructure/packageBuilder";
import { parseStoreZip } from "../../src/infrastructure/zipReader";
import { makeSession, makeSnapshot } from "../helpers/fixtures";

function jsonEntry(bytes: Uint8Array, path: string): Record<string, unknown> {
  const entry = parseStoreZip(bytes).find((item) => item.path === path);
  if (!entry) throw new Error(`Missing ${path}`);
  return JSON.parse(new TextDecoder().decode(entry.bytes)) as Record<string, unknown>;
}

describe("evidence coverage artifact", () => {
  it("reports runtime-only single-viewport evidence without inventing correlation", async () => {
    const result = await buildEvidencePackage({
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [],
    });
    const artifact = jsonEntry(result.bytes, "coverage/evidence-coverage.json");
    expect(artifact.schema_id).toBe("urn:edis:schema:browser:evidence-coverage");
    const data = artifact.data as {
      source_context_imported: boolean;
      distinct_viewports: number;
      statuses: Record<string, string>;
    };
    expect(data.source_context_imported).toBe(false);
    expect(data.distinct_viewports).toBe(1);
    expect(data.statuses.runtime_evidence).toBe("AVAILABLE");
    expect(data.statuses.source_runtime_binding).toBe("INSUFFICIENT");
    expect(data.statuses.responsive_comparison).toBe("INSUFFICIENT");
    expect(data.statuses.visual_verification).toBe("INSUFFICIENT");
  });
});
