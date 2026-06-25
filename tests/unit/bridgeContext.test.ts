import { describe, expect, it } from "vitest";
import { parseImportedSourceContext } from "../../src/domain/bridge";
import { canonicalJson } from "../../src/domain/canonical";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const digestC = `sha256:${"c".repeat(64)}`;

function context(analysisSetId: string | null = "123e4567-e89b-42d3-a456-426614174000") {
  return {
    schema_id: "urn:edis:schema:wordpress:bridge-context",
    schema_version: "1.0.0",
    artifact_type: "edis_source_context",
    producer: { product: "EDIS WordPress Evidence Exporter", version: "3.2.0" },
    captured_at: "2026-06-14T12:00:00.000Z",
    canonicalization: { profile: "EDIS-CJ-1", hash_algorithm: "sha256" },
    data: {
      analysis_set_id: analysisSetId,
      wordpress_bundle_id: "223e4567-e89b-42d3-a456-426614174000",
      source_export_root_sha256: digestA,
      site_fingerprint: digestB,
      url_normalization_profile: "EDIS-URL-1",
      site_locator_candidates: [digestC],
      multisite_mode: "SINGLE_SITE",
      site_path_scope: "/",
      source_truth_state: "VERIFIED",
      source_availability: "AVAILABLE",
      documents: [
        {
          document_id: "123",
          document_type: "page",
          document_fingerprint: digestA,
          saved_source_sha256: digestB,
          page_locator_candidates: [digestC],
          public_routability: "PUBLIC",
          source_storage_kind: "POST_META",
          source_state: "PUBLISHED",
          architecture_kinds: ["legacy"],
          source_truth_state: "VERIFIED",
          source_availability: "AVAILABLE",
          elements: [
            {
              document_id: "123",
              source_element_key: digestA,
              source_record_sha256: digestB,
              elementor_element_id: "abc123",
              id_occurrence_count: 1,
              id_uniqueness: "UNIQUE",
              parent_elementor_id: null,
              ancestor_elementor_ids: [],
              source_path: "elements[0]",
              document_order: 0,
              element_kind: "widget",
              el_type: "widget",
              widget_type: "heading",
              architecture_kind: "legacy",
              source_truth_state: "VERIFIED",
              source_availability: "AVAILABLE",
            },
          ],
        },
      ],
    },
    diagnostics: [],
  };
}

describe("Bridge Context import", () => {
  it("accepts canonical, bounded Bridge Context and records explicit confirmation separately", async () => {
    const value = context();
    const record = await parseImportedSourceContext(canonicalJson(value), "123");
    expect(record.selected_document_id).toBe("123");
    expect(record.confirmation_state).toBe("CONFIRMED");
    expect(record.imported_source_context_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("does not mark automatic single-document selection as user confirmed", async () => {
    const record = await parseImportedSourceContext(canonicalJson(context()), null);
    expect(record.selected_document_id).toBe("123");
    expect(record.confirmation_state).toBe("NOT_CONFIRMED");
  });

  it("rejects non-v4 analysis set identifiers", async () => {
    await expect(
      parseImportedSourceContext(
        canonicalJson(context("123e4567-e89b-52d3-a456-426614174000")),
        null,
      ),
    ).rejects.toThrow(/schema validation/i);
  });

  it("rejects an explicit selection that is absent from the imported document set", async () => {
    await expect(
      parseImportedSourceContext(canonicalJson(context()), "missing-document"),
    ).rejects.toThrow(/does not exist/i);
  });

  it("rejects duplicate document identifiers", async () => {
    const value = context();
    const [documentRecord] = value.data.documents;
    if (!documentRecord) throw new Error("Fixture document is missing.");
    value.data.documents.push(structuredClone(documentRecord));
    await expect(parseImportedSourceContext(canonicalJson(value), null)).rejects.toThrow(
      /duplicate document_id/i,
    );
  });

  it("rejects an element whose document identifier disagrees with its parent document", async () => {
    const value = context();
    const [documentRecord] = value.data.documents;
    const [elementRecord] = documentRecord?.elements ?? [];
    if (!elementRecord) throw new Error("Fixture element is missing.");
    elementRecord.document_id = "different-document";
    await expect(parseImportedSourceContext(canonicalJson(value), null)).rejects.toThrow(
      /does not match its parent document/i,
    );
  });

  it("rejects duplicate source element keys within one document", async () => {
    const value = context();
    const [documentRecord] = value.data.documents;
    const [elementRecord] = documentRecord?.elements ?? [];
    if (!documentRecord || !elementRecord) throw new Error("Fixture relationship is missing.");
    const duplicate = structuredClone(elementRecord);
    duplicate.document_order = 1;
    duplicate.source_path = "elements[1]";
    documentRecord.elements.push(duplicate);
    await expect(parseImportedSourceContext(canonicalJson(value), null)).rejects.toThrow(
      /duplicate source_element_key/i,
    );
  });

  it("rejects non-canonical source context bytes", async () => {
    await expect(
      parseImportedSourceContext(`${JSON.stringify(context(), null, 2)}\n`, null),
    ).rejects.toThrow(/canonical/i);
  });
});
