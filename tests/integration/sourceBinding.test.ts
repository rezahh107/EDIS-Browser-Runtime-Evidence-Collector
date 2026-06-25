// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collectElements } from "../../src/content/collectors/element";
import {
  DEFAULT_PREFERENCES,
  type BindingContext,
  type CaptureConfiguration,
} from "../../src/domain/model";

const hashA = `sha256:${"a".repeat(64)}` as const;
const hashB = `sha256:${"b".repeat(64)}` as const;

const bindingContext: BindingContext = {
  site_path_scope: "/",
  reference: {
    analysis_set_id: "123e4567-e89b-42d3-a456-426614174000",
    wordpress_bundle_id: "223e4567-e89b-42d3-a456-426614174000",
    imported_source_context_sha256: hashA,
    source_export_root_sha256: hashB,
    site_fingerprint: hashA,
    selected_document_id: "123",
    selected_document_fingerprint: hashB,
    confirmation_state: "NOT_CONFIRMED",
  },
  documents: [
    {
      document_id: "123",
      document_type: "page",
      document_fingerprint: hashB,
      saved_source_sha256: hashA,
      page_locator_candidates: [],
      public_routability: "PUBLIC",
      source_storage_kind: "POST_META",
      source_state: "PUBLISHED",
      architecture_kinds: ["legacy"],
      source_truth_state: "VERIFIED",
      source_availability: "AVAILABLE",
      elements: [
        {
          document_id: "123",
          source_element_key: hashA,
          source_record_sha256: hashB,
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
  selected_document: {
    document_id: "123",
    document_type: "page",
    document_fingerprint: hashB,
    saved_source_sha256: hashA,
    page_locator_candidates: [],
    public_routability: "PUBLIC",
    source_storage_kind: "POST_META",
    source_state: "PUBLISHED",
    architecture_kinds: ["legacy"],
    source_truth_state: "VERIFIED",
    source_availability: "AVAILABLE",
    elements: [
      {
        document_id: "123",
        source_element_key: hashA,
        source_record_sha256: hashB,
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
};

const configuration: CaptureConfiguration = {
  ...DEFAULT_PREFERENCES,
  sessionId: "323e4567-e89b-42d3-a456-426614174000",
  snapshotId: "423e4567-e89b-42d3-a456-426614174000",
  observationIndex: 0,
  userLabel: "Desktop",
  evidenceLabel: "USER_LABELED_VIEWPORT",
  requestedProfileId: "DESKTOP",
  workflowMode: "RUNTIME_EVIDENCE",
  expectedPageFingerprint: null,
  expectedViewportWidth: null,
  capturedAt: "2026-06-14T12:00:00.000Z",
  bindingContext,
};

describe("runtime-to-source binding evidence", () => {
  it("emits exact preliminary binding only with matching page marker and unique source/runtime IDs", async () => {
    const element = fixture(["123"]);
    const result = await collectElements([element], configuration);
    expect(result.measurements[0]?.source_binding.binding_state).toBe("EXACT");
    expect(result.measurements[0]?.source_binding.elementor_element_id).toBe("abc123");
    expect(result.measurements[0]?.source_binding.source_element_key).toBe(hashA);
  });

  it("preserves conflicting page-document markers as ambiguous", async () => {
    const element = fixture(["123", "999"]);
    const result = await collectElements([element], configuration);
    expect(result.measurements[0]?.source_binding.binding_state).toBe("AMBIGUOUS");
    expect(result.measurements[0]?.source_binding.reason_codes).toContain("DOCUMENT_MISMATCH");
  });

  it("keeps raw markers but does not interpret them without imported context", async () => {
    const element = fixture(["123"]);
    const result = await collectElements([element], { ...configuration, bindingContext: null });
    expect(result.measurements[0]?.runtime_elementor_markers.data_id).toBe("abc123");
    expect(result.measurements[0]?.source_binding.elementor_element_id).toBeNull();
    expect(result.measurements[0]?.source_binding.binding_state).toBe("UNMATCHED");
  });

  it("binds a unique marker to an additional source document without pretending it belongs to the selected page document", async () => {
    const baseDocument = requireValue(bindingContext.documents[0], "base source document");
    const baseElement = requireValue(baseDocument.elements[0], "base source element");
    const additionalDocument = {
      ...baseDocument,
      document_id: "71",
      document_type: "header",
      document_fingerprint: hashA,
      elements: [
        {
          ...baseElement,
          document_id: "71",
          source_element_key: hashB,
          source_record_sha256: hashA,
          elementor_element_id: "header123",
          widget_type: "site-logo",
          editor_label: "Site Header Logo",
          editor_label_source: "ELEMENTOR_EDITOR_METADATA" as const,
        },
      ],
    };
    document.body.textContent = "";
    const page = document.createElement("main");
    page.dataset.elementorId = "123";
    const headerElement = document.createElement("div");
    headerElement.className = "elementor-element elementor-widget elementor-widget-site-logo";
    headerElement.dataset.id = "header123";
    document.body.append(page, headerElement);
    mockLayout(headerElement);

    const context = {
      ...bindingContext,
      documents: [...bindingContext.documents, additionalDocument],
    };
    const result = await collectElements([headerElement], {
      ...configuration,
      bindingContext: context,
    });
    const binding = requireValue(result.measurements[0], "header measurement").source_binding;
    expect(binding.binding_state).toBe("EXACT");
    expect(binding.source_document_id).toBe("71");
    expect(binding.source_document_type).toBe("header");
    expect(binding.source_widget_type).toBe("site-logo");
    expect(binding.source_editor_label).toBe("Site Header Logo");
    expect(binding.reason_codes).toContain("ADDITIONAL_SOURCE_DOCUMENT");
    expect(result.sourceDocumentsPresent.map((item) => item.document_id)).toContain("71");
  });

  it("emits page lineage, technical widget markers, regions, and a factual structure summary", async () => {
    const element = fixture(["123"]);
    element.classList.add("elementor-widget", "elementor-widget-heading");
    const result = await collectElements([element], configuration, hashA);
    const measurement = requireValue(result.measurements[0], "widget measurement");
    expect(measurement.evidence_lineage.page_context_id).toBe(hashA);
    expect(measurement.evidence_lineage.source_document_id).toBe("123");
    expect(measurement.runtime_elementor_markers.widget_class_markers).toContain(
      "elementor-widget-heading",
    );
    expect(result.pageStructureSummary.runtime_widget_marker_count).toBe(1);
    expect(result.pageStructureSummary.exact_binding_count).toBe(1);
  });

  it("records one-to-many runtime candidates without performing final correlation", async () => {
    document.body.textContent = "";
    const page = document.createElement("main");
    page.dataset.elementorId = "123";
    document.body.append(page);
    const first = document.createElement("div");
    const second = document.createElement("div");
    for (const element of [first, second]) {
      element.className = "elementor-element";
      element.dataset.id = "abc123";
      document.body.append(element);
      mockLayout(element);
    }

    const result = await collectElements([first, second], configuration, hashA);
    expect(result.sourceRuntimeCardinality.source_elements_with_multiple_candidates).toBe(1);
    expect(result.sourceRuntimeCardinality.records[0]?.cardinality_state).toBe("ONE_TO_MANY");
    expect(result.sourceRuntimeCardinality.records[0]?.runtime_candidate_node_ids).toEqual([
      "node-000001",
      "node-000002",
    ]);
    expect(result.measurements[0]?.runtime_instance.instance_state).toBe("MULTIPLE_RUNTIME_ROOTS");
    expect(result.documentInstances).toHaveLength(2);
  });

  it("labels repetition as a template only when source evidence identifies a loop-item document", async () => {
    const loopDocument = {
      ...requireValue(bindingContext.documents[0], "base source document"),
      document_type: "loop-item",
    };
    const loopContext: BindingContext = {
      ...bindingContext,
      documents: [loopDocument],
      selected_document: loopDocument,
    };
    document.body.textContent = "";
    const page = document.createElement("main");
    page.dataset.elementorId = "123";
    document.body.append(page);
    const first = document.createElement("div");
    const second = document.createElement("div");
    for (const element of [first, second]) {
      element.className = "elementor-element";
      element.dataset.id = "abc123";
      document.body.append(element);
      mockLayout(element);
    }

    const result = await collectElements(
      [first, second],
      { ...configuration, bindingContext: loopContext },
      hashA,
    );
    expect(result.measurements.map((item) => item.runtime_instance.instance_state)).toEqual([
      "REPEATED_TEMPLATE",
      "REPEATED_TEMPLATE",
    ]);
    expect(result.pageStructureSummary.repeated_runtime_instance_group_count).toBe(1);
  });
});

function fixture(pageMarkers: readonly string[]): HTMLDivElement {
  document.body.textContent = "";
  for (const value of pageMarkers) {
    const page = document.createElement("main");
    page.dataset.elementorId = value;
    document.body.append(page);
  }
  const element = document.createElement("div");
  element.className = "elementor-element";
  element.dataset.id = "abc123";
  document.body.append(element);
  mockLayout(element);
  return element;
}

function mockLayout(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      right: 100,
      bottom: 40,
      left: 0,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    }) as DOMRect;
  for (const [name, value] of Object.entries({
    clientWidth: 100,
    clientHeight: 40,
    scrollWidth: 100,
    scrollHeight: 40,
    offsetWidth: 100,
    offsetHeight: 40,
  }))
    Object.defineProperty(element, name, { configurable: true, value });
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}.`);
  return value;
}
