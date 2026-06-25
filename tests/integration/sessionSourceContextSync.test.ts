import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  synchronizeEmptyCurrentSessionSourceContext,
} from "../../src/application/sessionUseCases";
import type { SourceContextReference } from "../../src/domain/model";
import { EvidenceRepository } from "../../src/infrastructure/storage/indexedDb";
import { hashA, hashB } from "../helpers/fixtures";

const values = new Map<string, unknown>();
const storageArea = {
  get: vi.fn(async (key?: string) =>
    key ? { [key]: values.get(key) } : Object.fromEntries(values),
  ),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) values.set(key, value);
  }),
  remove: vi.fn(async (key: string) => {
    values.delete(key);
  }),
  clear: vi.fn(async () => values.clear()),
};

vi.stubGlobal("chrome", {
  storage: { session: storageArea, local: storageArea, sync: storageArea },
});

const reference: SourceContextReference = {
  analysis_set_id: "723e4567-e89b-42d3-a456-426614174000",
  wordpress_bundle_id: "823e4567-e89b-42d3-a456-426614174000",
  imported_source_context_sha256: hashA,
  source_export_root_sha256: hashB,
  site_fingerprint: hashA,
  selected_document_id: "42",
  selected_document_fingerprint: hashB,
  confirmation_state: "CONFIRMED",
};

describe("empty session Source Context synchronization", () => {
  beforeEach(async () => {
    values.clear();
    await new EvidenceRepository().clearAll();
  });

  it("uses runtime provenance entropy so separate browser sessions do not collide", async () => {
    const chromeSession = await createSession("Same page", "Chrome", "149");
    const edgeSession = await createSession("Same page", "Edge", "149");
    expect(chromeSession.data.session_id).not.toBe(edgeSession.data.session_id);
    expect(chromeSession.data.observation_set_id).not.toBe(edgeSession.data.observation_set_id);
  });

  it("attaches a newly imported confirmed Source Context to the selected empty session", async () => {
    const session = await createSession("Python feed session");
    expect(await synchronizeEmptyCurrentSessionSourceContext(reference)).toBe(true);
    const stored = await new EvidenceRepository().getSession(session.data.session_id);
    expect(stored?.data.source_context_reference).toEqual(reference);
    expect(stored?.data.source_binding_state).toBe("PROBABLE");
  });

  it("does not rewrite Source Context provenance after a capture summary exists", async () => {
    const session = await createSession("Protected session");
    const repository = new EvidenceRepository();
    await repository.putSession({
      ...session,
      data: {
        ...session.data,
        captures: [
          {
            snapshot_id: "923e4567-e89b-42d3-a456-426614174000",
            label: "Desktop",
            captured_at: session.captured_at,
            actual_width: 1440,
            actual_height: 900,
            page_context_id: hashA,
            page_fingerprint: hashB,
            page_binding_state: "UNMATCHED",
            page_binding_reason_codes: [],
            source_document_id: null,
            source_document_type: null,
            source_document_count: 0,
            source_section_count: 0,
            source_widget_count: 0,
            runtime_region_count: 0,
            runtime_section_region_count: 0,
            runtime_container_region_count: 0,
            runtime_widget_marker_count: 0,
            exact_binding_count: 0,
            probable_binding_count: 0,
            ambiguous_binding_count: 0,
            unmatched_runtime_node_count: 0,
            element_count: 0,
            overflow_count: 0,
            diagnostic_count: 0,
            screenshot_available: false,
            completeness_status: "COMPLETE",
            partial_reasons: [],
            truncated_branch_count: 0,
            identity_collision_count: 0,
            skipped_hidden_subtree_count: 0,
            capture_environment_warning_count: 0,
            status: "COMPLETE",
          },
        ],
        status: "COMPLETE",
      },
    });
    expect(await synchronizeEmptyCurrentSessionSourceContext(reference)).toBe(false);
    const stored = await repository.getSession(session.data.session_id);
    expect(stored?.data.source_context_reference).toBeNull();
  });
});
