import { diagnostic, type Diagnostic } from "../../domain/diagnostics";
import { classifyElementorMarker } from "../../domain/elementorMarker";
import { normalizeFiniteNumber } from "../../domain/geometry";
import {
  buildElementIdentities,
  hasElementorMarker,
  markerOccurrenceCount,
  runtimeElementorMarkers,
  stableDomReference,
  structuralOrdinals,
} from "../../domain/identity";
import type {
  BindingContext,
  BindingState,
  BridgeDocumentRecord,
  BridgeElementRecord,
  CaptureConfiguration,
  ElementMeasurement,
  HashDigest,
  InteractionFacts,
  DocumentInstanceEvidence,
  PageStructureSummary,
  RelationshipEvidence,
  RuntimeRegion,
  SourceBindingEvidence,
  SourceRuntimeCardinalityEvidence,
  SourceDocumentPresence,
  TextShapeEvidence,
} from "../../domain/model";
import { sha256Digest } from "../../infrastructure/checksum";
import { measureGeometry } from "../measurements/geometry";
import { collectComputedStyles } from "../measurements/styles";
import {
  ancestorMeasurementsFor,
  computedStyleFor,
  createCaptureMeasurementContext,
  type CaptureMeasurementContext,
} from "../measurements/context";
import { inspectEffectiveVisibility } from "../measurements/visibility";
import { stableIdCandidate } from "../../domain/redaction";
import { isInteractiveCandidate } from "../selectors/selectElements";

const ANCESTOR_SEARCH_LIMIT = 64;
const TEXT_NODE_LIMIT = 500;
const TEXT_CHARACTER_LIMIT = 200_000;
const TEXT_SCAN_NODE_LIMIT = 20_000;
const TEXT_SCAN_CHARACTER_LIMIT = 2_000_000;
const TEXT_SCAN_ANCESTOR_STEP_LIMIT = 200_000;
const LINE_RECT_LIMIT = 2_000;

interface TextNodeCollection {
  readonly nodes: readonly Text[];
  readonly text: string;
  readonly limitReached: boolean;
}

interface TextNodeLineEvidence {
  readonly tops: readonly string[];
  readonly rectCount: number;
}

interface TextMeasurementContext {
  readonly collections: WeakMap<Element, TextNodeCollection>;
  readonly lineEvidence: WeakMap<Text, TextNodeLineEvidence | null>;
}

const GRAPHEME_SEGMENTER =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const WORD_SEGMENTER =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

export interface ElementCollectionMetrics {
  readonly elementorElements: number;
  readonly interactiveCandidates: number;
  readonly fixedElements: number;
  readonly stickyElements: number;
}

export interface ElementCollectionResult {
  readonly measurements: readonly ElementMeasurement[];
  readonly runtimeRegions: readonly RuntimeRegion[];
  readonly pageStructureSummary: PageStructureSummary;
  readonly sourceDocumentsPresent: readonly SourceDocumentPresence[];
  readonly documentInstances: readonly DocumentInstanceEvidence[];
  readonly sourceRuntimeCardinality: SourceRuntimeCardinalityEvidence;
  readonly metrics: ElementCollectionMetrics;
  readonly diagnostics: readonly Diagnostic[];
  readonly identityCollisionCount: number;
}

interface PreparedElement {
  readonly element: Element;
  readonly identity: Omit<ElementMeasurement["identity"], "reference_sha256">;
  readonly sourceIndex: number;
  readonly geometry: ReturnType<typeof measureGeometry> & { readonly ok: true };
}

export async function collectElements(
  elements: readonly Element[],
  config: CaptureConfiguration,
  pageContextId?: HashDigest,
  providedMeasurementContext?: CaptureMeasurementContext,
): Promise<ElementCollectionResult> {
  const measurementContext =
    providedMeasurementContext ??
    createCaptureMeasurementContext(elements[0]?.ownerDocument ?? globalThis.document);
  const sourceBindingContext = prepareSourceBindingContext(
    elements[0]?.ownerDocument ?? globalThis.document,
    config.bindingContext,
  );
  const resolvedPageContextId = pageContextId ?? (await sha256Digest(config.snapshotId));
  const diagnostics: Diagnostic[] = [];
  const identities = buildElementIdentities(
    elements,
    config.redactionMode,
    measurementContext.identity,
  );
  const prepared: PreparedElement[] = [];
  let identityCollisionCount = 0;

  for (const [sourceIndex, element] of elements.entries()) {
    const geometry = measureGeometry(element, measurementContext);
    if (!geometry.ok) {
      diagnostics.push(
        diagnostic(
          geometry.error === "NON_FINITE"
            ? "EDIS_RUNTIME_NON_FINITE_GEOMETRY"
            : "EDIS_RUNTIME_PARTIAL_IDENTITY",
          "WARNING",
          "Element omitted because geometry was unavailable.",
          true,
          { tag: element.tagName.toLowerCase(), source_order: sourceIndex },
        ),
      );
      continue;
    }
    const identity = identities[sourceIndex];
    if (!identity) continue;
    if (identity.identity_status === "AMBIGUOUS") identityCollisionCount += 1;
    prepared.push({
      element,
      identity,
      sourceIndex,
      geometry: geometry as PreparedElement["geometry"],
    });
  }

  const emittedNodeIds = new Map<Element, string>();
  for (const [index, item] of prepared.entries()) emittedNodeIds.set(item.element, nodeId(index));
  const textMeasurementContext = config.includeTextShape
    ? prepareTextMeasurementContext(prepared.map((item) => item.element))
    : null;
  const provisionalMeasurements: ElementMeasurement[] = [];

  for (const [documentOrder, item] of prepared.entries()) {
    const { element, geometry, identity } = item;
    const html = element instanceof HTMLElement ? element : null;
    const style = computedStyleFor(element, measurementContext);
    const opacity = finiteOpacity(style.opacity);
    const rect = geometry.value.rect;
    const clientWidth = finite(html?.clientWidth ?? Math.round(rect.width));
    const clientHeight = finite(html?.clientHeight ?? Math.round(rect.height));
    const scrollWidth = finite(html?.scrollWidth ?? Math.round(rect.width));
    const scrollHeight = finite(html?.scrollHeight ?? Math.round(rect.height));
    const offsetWidth = finite(html?.offsetWidth ?? Math.round(rect.width));
    const offsetHeight = finite(html?.offsetHeight ?? Math.round(rect.height));
    const hasBox = rect.width > 0 && rect.height > 0;
    const visibilityObservation = inspectEffectiveVisibility(element, measurementContext);
    const markers = runtimeElementorMarkers(element);
    const sourceBinding = buildSourceBinding(
      element,
      markers,
      config,
      sourceBindingContext,
      measurementContext,
    );
    const relationships = config.includeRelationshipGraph
      ? await buildRelationships(element, emittedNodeIds, measurementContext)
      : disabledRelationships(element, measurementContext);
    const interactionFacts = config.includeInteractionFacts
      ? collectInteractionFacts(element, style)
      : disabledInteractionFacts(element, style);
    const textShape = config.includeTextShape
      ? collectTextShape(
          element,
          style,
          clientWidth,
          clientHeight,
          scrollWidth,
          scrollHeight,
          config.includeTextPreview,
          config.maxTextPreviewChars,
          textMeasurementContext,
        )
      : disabledTextShape(style);

    const currentNodeId = nodeId(documentOrder);
    provisionalMeasurements.push({
      node_id: currentNodeId,
      document_order: documentOrder,
      evidence_lineage: {
        page_context_id: resolvedPageContextId,
        snapshot_id: config.snapshotId,
        runtime_node_id: currentNodeId,
        source_document_id: sourceBinding.source_document_id,
        source_document_type: sourceBinding.source_document_type,
        source_element_key: sourceBinding.source_element_key,
        source_section_key: sourceBinding.source_section_key,
        binding_state: sourceBinding.binding_state,
      },
      identity: {
        ...identity,
        reference_sha256: await sha256Digest(identity.stable_dom_reference),
      },
      runtime_elementor_markers: markers,
      source_binding: sourceBinding,
      relationships,
      bounding_rect: rect,
      document_coordinates: { x: geometry.value.documentX, y: geometry.value.documentY },
      viewport_intersection: geometry.value.intersection,
      area: geometry.value.area,
      positioning: geometry.value.positioning,
      computed_styles: collectComputedStyles(element, config.includeColors, measurementContext),
      visibility: {
        display: style.display,
        visibility: style.visibility,
        opacity,
        direct_hidden: visibilityObservation.directHidden,
        hidden_by_ancestor: visibilityObservation.hiddenByAncestor,
        nearest_hidden_ancestor_reference: visibilityObservation.nearestHiddenAncestorReference,
        nearest_hidden_ancestor_node_id: visibilityObservation.nearestHiddenAncestor
          ? (emittedNodeIds.get(visibilityObservation.nearestHiddenAncestor) ?? null)
          : null,
        rendered: visibilityObservation.effectiveVisible && hasBox,
        effective_rendered: visibilityObservation.effectiveVisible && hasBox,
        has_box: hasBox,
        intersects_viewport: geometry.value.intersection.intersects,
      },
      overflow: {
        client_width: clientWidth,
        client_height: clientHeight,
        scroll_width: scrollWidth,
        scroll_height: scrollHeight,
        offset_width: offsetWidth,
        offset_height: offsetHeight,
        horizontal_overflow: scrollWidth > clientWidth + 1,
        vertical_overflow: scrollHeight > clientHeight + 1,
        clipped_by_ancestor: geometry.value.clipped,
      },
      interaction_facts: interactionFacts,
      text_shape: textShape,
      runtime_instance: {
        availability: "INSUFFICIENT",
        instance_state: "UNKNOWN",
        instance_group_id: null,
        instance_index: null,
        observed_instance_count: 0,
        source_element_key: sourceBinding.source_element_key,
        source_document_id: sourceBinding.source_document_id,
        instance_basis: "NO_VALIDATED_SOURCE_KEY",
        basis_evidence: ["RUNTIME_INSTANCE_NOT_EVALUATED"],
      },
      computed_style_origin: {
        availability: "INSUFFICIENT",
        observation_kind: "RESOLVED_COMPUTED_VALUE_ONLY",
        cssom_rule_inspection_performed: false,
        matched_rule_accessibility: "NOT_MEASURED",
        custom_property_reference_observation: "NOT_MEASURED",
      },
    });
  }

  const measurements = await attachRuntimeInstanceEvidence(
    provisionalMeasurements,
    resolvedPageContextId,
  );

  if (identityCollisionCount > 0) {
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_IDENTITY_COLLISION",
        "WARNING",
        "Identity candidates collided.",
        true,
        { ambiguous_elements: identityCollisionCount },
      ),
    );
  }
  const boundedTextShapes = measurements.filter(
    (item) => item.text_shape.measurement_status === "BOUNDED_LIMIT_REACHED",
  ).length;
  if (boundedTextShapes > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_TEXT_SHAPE_LIMIT_REACHED",
        "WARNING",
        "Text-shape collection reached a deterministic scan or per-element budget.",
        true,
        { bounded_elements: boundedTextShapes },
      ),
    );
  const ambiguousBindings = measurements.filter(
    (item) => item.source_binding.binding_state === "AMBIGUOUS",
  ).length;
  if (ambiguousBindings > 0)
    diagnostics.push(
      diagnostic(
        "EDIS_RUNTIME_SOURCE_BINDING_AMBIGUOUS",
        "WARNING",
        "Source binding evidence is ambiguous.",
        true,
        { ambiguous_bindings: ambiguousBindings },
      ),
    );
  const runtimeRegions = buildRuntimeRegions(prepared, measurements, emittedNodeIds, config);
  const documentInstances = await buildDocumentInstances(
    measurements,
    config.bindingContext,
    config.includeRelationshipGraph,
  );
  const pageStructureSummary = buildPageStructureSummary(
    measurements,
    runtimeRegions,
    documentInstances,
  );
  const sourceDocumentsPresent = buildSourceDocumentsPresent(measurements, config.bindingContext);
  const sourceRuntimeCardinality = buildSourceRuntimeCardinality(
    measurements,
    config.bindingContext,
  );
  const metrics = collectEmittedMetrics(prepared);
  return {
    measurements,
    runtimeRegions,
    pageStructureSummary,
    sourceDocumentsPresent,
    documentInstances,
    sourceRuntimeCardinality,
    metrics,
    diagnostics,
    identityCollisionCount,
  };
}

async function attachRuntimeInstanceEvidence(
  measurements: readonly ElementMeasurement[],
  pageContextId: HashDigest,
): Promise<readonly ElementMeasurement[]> {
  const directGroups = new Map<HashDigest, ElementMeasurement[]>();
  for (const measurement of measurements) {
    const binding = measurement.source_binding;
    if (binding.binding_basis !== "DIRECT_VALIDATED_MARKER" || binding.source_element_key === null)
      continue;
    const group = directGroups.get(binding.source_element_key) ?? [];
    group.push(measurement);
    directGroups.set(binding.source_element_key, group);
  }

  const groupIds = new Map<HashDigest, HashDigest>();
  for (const key of directGroups.keys()) {
    groupIds.set(key, await sha256Digest(`runtime-instance-group:${pageContextId}:${key}`));
  }

  return measurements.map((measurement) => {
    const binding = measurement.source_binding;
    const key = binding.source_element_key;
    if (key === null) return measurement;
    const group = directGroups.get(key) ?? [];
    const groupId = groupIds.get(key) ?? null;
    if (binding.binding_basis === "DIRECT_VALIDATED_MARKER") {
      const index = group.findIndex((item) => item.node_id === measurement.node_id);
      const repeated = group.length > 1;
      const repeatedTemplate =
        repeated && binding.source_document_type?.toLowerCase() === "loop-item";
      return {
        ...measurement,
        runtime_instance: {
          availability: "AVAILABLE",
          instance_state: !repeated
            ? "SINGLE_RENDER"
            : repeatedTemplate
              ? "REPEATED_TEMPLATE"
              : "MULTIPLE_RUNTIME_ROOTS",
          instance_group_id: groupId,
          instance_index: index >= 0 ? index : null,
          observed_instance_count: group.length,
          source_element_key: key,
          source_document_id: binding.source_document_id,
          instance_basis: "SHARED_SOURCE_ELEMENT_KEY",
          basis_evidence: repeated
            ? [
                "DIRECT_VALIDATED_MARKER",
                "SHARED_SOURCE_ELEMENT_KEY",
                repeatedTemplate ? "SOURCE_DOCUMENT_TYPE_LOOP_ITEM" : "REPETITION_KIND_UNRESOLVED",
              ]
            : ["DIRECT_VALIDATED_MARKER", "SINGLE_RUNTIME_CANDIDATE"],
        },
      };
    }
    if (binding.binding_basis === "ANCESTOR_VALIDATED_MARKER") {
      return {
        ...measurement,
        runtime_instance: {
          availability: "PARTIAL",
          instance_state: "NESTED_COMPONENT",
          instance_group_id: groupId,
          instance_index: null,
          observed_instance_count: group.length,
          source_element_key: key,
          source_document_id: binding.source_document_id,
          instance_basis: "SHARED_SOURCE_ELEMENT_KEY",
          basis_evidence: ["ANCESTOR_VALIDATED_MARKER", "NESTED_RUNTIME_DESCENDANT"],
        },
      };
    }
    return measurement;
  });
}

async function buildDocumentInstances(
  measurements: readonly ElementMeasurement[],
  context: BindingContext | null,
  relationshipGraphEnabled: boolean,
): Promise<readonly DocumentInstanceEvidence[]> {
  if (!context || !relationshipGraphEnabled) return [];
  const byNode = new Map(measurements.map((item) => [item.node_id, item]));
  const grouped = new Map<string, ElementMeasurement[]>();
  for (const measurement of measurements) {
    const documentId = measurement.source_binding.source_document_id;
    if (!documentId) continue;
    const group = grouped.get(documentId) ?? [];
    group.push(measurement);
    grouped.set(documentId, group);
  }

  const output: DocumentInstanceEvidence[] = [];
  for (const [documentId, group] of [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const source = context.documents.find((item) => item.document_id === documentId);
    if (!source) continue;
    const groupNodes = new Set(group.map((item) => item.node_id));
    const roots = group
      .filter((item) => {
        const parentId = item.relationships.nearest_emitted_parent_node_id;
        return parentId === null || !groupNodes.has(parentId);
      })
      .sort((left, right) => left.document_order - right.document_order);

    for (const [instanceIndex, root] of roots.entries()) {
      const assigned = group.filter((candidate) => belongsToRuntimeRoot(candidate, root, byNode));
      const states = assigned.map((item) => item.source_binding.binding_state);
      const bindingState = aggregateBindingState(states);
      const digest = await sha256Digest(
        `document-instance:${root.evidence_lineage.snapshot_id}:${documentId}:${root.node_id}:${instanceIndex}`,
      );
      output.push({
        document_instance_id: `document-instance-${digest.slice(7, 23)}`,
        source_document_id: documentId,
        source_document_type: source.document_type,
        runtime_root_node_ids: [root.node_id],
        bound_runtime_node_count: assigned.length,
        instance_index: instanceIndex,
        binding_state: bindingState,
        basis_evidence: ["SOURCE_DOCUMENT_BINDING", "DISCONNECTED_RUNTIME_ROOT"],
      });
    }
  }
  return output.sort(
    (left, right) =>
      left.source_document_id.localeCompare(right.source_document_id) ||
      left.instance_index - right.instance_index,
  );
}

function belongsToRuntimeRoot(
  candidate: ElementMeasurement,
  root: ElementMeasurement,
  byNode: ReadonlyMap<string, ElementMeasurement>,
): boolean {
  let current: ElementMeasurement | undefined = candidate;
  let steps = 0;
  while (current && steps < ANCESTOR_SEARCH_LIMIT) {
    if (current.node_id === root.node_id) return true;
    const parentId: string | null = current.relationships.nearest_emitted_parent_node_id;
    current = parentId ? byNode.get(parentId) : undefined;
    steps += 1;
  }
  return false;
}

function aggregateBindingState(states: readonly BindingState[]): BindingState {
  if (states.some((state) => state === "AMBIGUOUS")) return "AMBIGUOUS";
  if (states.length > 0 && states.every((state) => state === "EXACT")) return "EXACT";
  if (states.some((state) => state === "EXACT" || state === "PROBABLE")) return "PROBABLE";
  return "UNMATCHED";
}

function buildSourceRuntimeCardinality(
  measurements: readonly ElementMeasurement[],
  context: BindingContext | null,
): SourceRuntimeCardinalityEvidence {
  const runtimeNodesWithoutSourceCandidate = measurements.filter(
    (item) =>
      item.source_binding.binding_basis !== "DIRECT_VALIDATED_MARKER" ||
      item.source_binding.source_element_key === null,
  ).length;
  if (!context) {
    return {
      availability: "INSUFFICIENT",
      source_elements_imported: 0,
      source_elements_with_zero_candidates: 0,
      source_elements_with_one_candidate: 0,
      source_elements_with_multiple_candidates: 0,
      runtime_nodes_without_source_candidate: runtimeNodesWithoutSourceCandidate,
      records: [],
    };
  }

  const observedDocumentIds = new Set(
    measurements
      .map((item) => item.source_binding.source_document_id)
      .filter((value): value is string => value !== null),
  );
  const scopedDocumentIds = new Set(observedDocumentIds);
  if (context.selected_document) scopedDocumentIds.add(context.selected_document.document_id);
  const scopedDocuments = context.documents.filter((document) =>
    scopedDocumentIds.has(document.document_id),
  );
  if (scopedDocuments.length === 0) {
    return {
      availability: "INSUFFICIENT",
      source_elements_imported: 0,
      source_elements_with_zero_candidates: 0,
      source_elements_with_one_candidate: 0,
      source_elements_with_multiple_candidates: 0,
      runtime_nodes_without_source_candidate: runtimeNodesWithoutSourceCandidate,
      records: [],
    };
  }

  const candidateNodes = new Map<string, string[]>();
  for (const measurement of measurements) {
    const binding = measurement.source_binding;
    if (binding.binding_basis !== "DIRECT_VALIDATED_MARKER" || binding.source_element_key === null)
      continue;
    const candidateKey = `${binding.source_document_id ?? ""}:${binding.source_element_key}`;
    const nodes = candidateNodes.get(candidateKey) ?? [];
    nodes.push(measurement.node_id);
    candidateNodes.set(candidateKey, nodes);
  }

  const records = scopedDocuments
    .flatMap((document) =>
      document.elements.map((source) => {
        const nodeIds = [
          ...(candidateNodes.get(`${document.document_id}:${source.source_element_key}`) ?? []),
        ].sort();
        const count = nodeIds.length;
        const documentObserved = observedDocumentIds.has(document.document_id);
        return {
          source_document_id: document.document_id,
          source_element_key: source.source_element_key,
          runtime_candidate_count: count,
          runtime_candidate_node_ids: nodeIds,
          cardinality_state: count === 0 ? "ZERO" : count === 1 ? "ONE" : "ONE_TO_MANY",
          absence_reason_codes:
            count > 0
              ? []
              : documentObserved
                ? ["RUNTIME_CANDIDATE_NOT_OBSERVED"]
                : ["SOURCE_DOCUMENT_NOT_PRESENT", "RUNTIME_CANDIDATE_NOT_OBSERVED"],
        } as const;
      }),
    )
    .sort(
      (left, right) =>
        left.source_document_id.localeCompare(right.source_document_id) ||
        left.source_element_key.localeCompare(right.source_element_key),
    );
  return {
    availability: measurements.some((item) => item.source_binding.binding_state === "AMBIGUOUS")
      ? "PARTIAL"
      : "AVAILABLE",
    source_elements_imported: records.length,
    source_elements_with_zero_candidates: records.filter(
      (item) => item.cardinality_state === "ZERO",
    ).length,
    source_elements_with_one_candidate: records.filter((item) => item.cardinality_state === "ONE")
      .length,
    source_elements_with_multiple_candidates: records.filter(
      (item) => item.cardinality_state === "ONE_TO_MANY",
    ).length,
    runtime_nodes_without_source_candidate: runtimeNodesWithoutSourceCandidate,
    records,
  };
}

function collectEmittedMetrics(prepared: readonly PreparedElement[]): ElementCollectionMetrics {
  let elementorElements = 0;
  let interactiveCandidates = 0;
  let fixedElements = 0;
  let stickyElements = 0;
  for (const item of prepared) {
    if (classifyElementorMarker(item.element).matched) elementorElements += 1;
    if (isInteractiveCandidate(item.element)) interactiveCandidates += 1;
    if (item.geometry.value.positioning === "fixed") fixedElements += 1;
    if (item.geometry.value.positioning === "sticky") stickyElements += 1;
  }
  return { elementorElements, interactiveCandidates, fixedElements, stickyElements };
}

interface PreparedSourceBindingContext {
  readonly sourceContext: BindingContext | null;
  readonly candidatesByElementId: ReadonlyMap<string, readonly SourceCandidate[]>;
  readonly recordsByDocumentAndElementId: ReadonlyMap<
    string,
    ReadonlyMap<string, BridgeElementRecord>
  >;
  readonly sectionByRecord: WeakMap<BridgeElementRecord, BridgeElementRecord | null>;
  readonly markersByElement: WeakMap<Element, ElementMeasurement["runtime_elementor_markers"]>;
  readonly pageEvidence: {
    readonly pageElementorDocumentId: string | null;
    readonly state: "MATCH" | "ABSENT" | "CONFLICT";
  };
}

function prepareSourceBindingContext(
  document: Document,
  sourceContext: BindingContext | null,
): PreparedSourceBindingContext {
  const candidatesByElementId = new Map<string, SourceCandidate[]>();
  const recordsByDocumentAndElementId = new Map<string, Map<string, BridgeElementRecord>>();
  if (sourceContext) {
    for (const sourceDocument of sourceContext.documents) {
      const recordsById = new Map<string, BridgeElementRecord>();
      for (const record of sourceDocument.elements) {
        const elementId = record.elementor_element_id;
        if (elementId === null) continue;
        const candidates = candidatesByElementId.get(elementId) ?? [];
        candidates.push({ document: sourceDocument, record });
        candidatesByElementId.set(elementId, candidates);
        if (record.id_uniqueness === "UNIQUE") recordsById.set(elementId, record);
      }
      recordsByDocumentAndElementId.set(sourceDocument.document_id, recordsById);
    }
  }
  const selectedDocumentId = sourceContext?.selected_document?.document_id ?? null;
  return {
    sourceContext,
    candidatesByElementId,
    recordsByDocumentAndElementId,
    sectionByRecord: new WeakMap<BridgeElementRecord, BridgeElementRecord | null>(),
    markersByElement: new WeakMap<Element, ElementMeasurement["runtime_elementor_markers"]>(),
    pageEvidence: selectedDocumentId
      ? pageDocumentEvidence(document, selectedDocumentId)
      : { pageElementorDocumentId: null, state: "ABSENT" },
  };
}

function buildSourceBinding(
  element: Element,
  markers: ElementMeasurement["runtime_elementor_markers"],
  config: CaptureConfiguration,
  preparedContext: PreparedSourceBindingContext,
  measurementContext: CaptureMeasurementContext,
): SourceBindingEvidence {
  const context = config.bindingContext;
  preparedContext.markersByElement.set(element, markers);
  const runtimeCount = markerOccurrenceCount(
    element.ownerDocument,
    "data-id",
    markers.data_id,
    measurementContext.identity,
  );
  if (!context)
    return unmatchedBinding(runtimeCount, "NO_SOURCE_CONTEXT", "SOURCE_CONTEXT_NOT_IMPORTED");
  if (context.documents.length === 0)
    return unmatchedBinding(runtimeCount, "NO_MATCH", "SOURCE_CONTEXT_HAS_NO_DOCUMENTS");

  const selected = context.selected_document;
  const pageEvidence = preparedContext.pageEvidence;
  const directCandidates =
    markers.data_id && hasElementorMarker(element)
      ? findSourceCandidates(preparedContext, markers.data_id)
      : [];
  if (directCandidates.length > 0) {
    return bindingFromCandidates(
      directCandidates,
      markers.data_id,
      runtimeCount,
      pageEvidence.pageElementorDocumentId,
      pageEvidence.state,
      "DIRECT_VALIDATED_MARKER",
      context.reference.confirmation_state,
      context,
      preparedContext,
    );
  }

  let ancestor = element.parentElement;
  let searched = 0;
  while (ancestor && searched < ANCESTOR_SEARCH_LIMIT) {
    const ancestorMarkers = sourceMarkersFor(ancestor, preparedContext);
    if (ancestorMarkers.data_id && hasElementorMarker(ancestor)) {
      const candidates = findSourceCandidates(preparedContext, ancestorMarkers.data_id);
      if (candidates.length > 0) {
        const binding = bindingFromCandidates(
          candidates,
          null,
          0,
          pageEvidence.pageElementorDocumentId,
          pageEvidence.state,
          "ANCESTOR_VALIDATED_MARKER",
          context.reference.confirmation_state,
          context,
          preparedContext,
        );
        return {
          ...binding,
          binding_state: binding.binding_state === "EXACT" ? "PROBABLE" : binding.binding_state,
          nearest_elementor_ancestor_id: ancestorMarkers.data_id,
          reason_codes: uniqueStrings([
            ...binding.reason_codes,
            "BOUND_TO_NEAREST_VALIDATED_ANCESTOR",
          ]),
        };
      }
    }
    ancestor = ancestor.parentElement;
    searched += 1;
  }

  const noMarker = markers.data_id === null;
  return {
    ...emptySourceMetadata(),
    availability: selected ? "AVAILABLE" : "INSUFFICIENT",
    binding_state: noMarker ? "UNMATCHED" : "PROBABLE",
    binding_basis: noMarker ? "NO_MATCH" : "RAW_MARKER_ONLY",
    page_elementor_document_id: pageEvidence.pageElementorDocumentId,
    elementor_element_id: null,
    nearest_elementor_ancestor_id: null,
    elementor_ancestor_ids: [],
    runtime_id_occurrence_count: runtimeCount,
    source_id_occurrence_count: 0,
    source_document_id: selected?.document_id ?? null,
    source_record_sha256: null,
    source_element_key: null,
    unique_in_runtime_document: runtimeCount === 1,
    unique_in_source_document: false,
    confirmation_state: context.reference.confirmation_state,
    reason_codes: [
      !selected
        ? "SOURCE_DOCUMENT_NOT_SELECTED"
        : noMarker
          ? hasElementorMarker(element)
            ? "ELEMENTOR_WRAPPER_WITHOUT_SOURCE_ID"
            : "OUTSIDE_ELEMENTOR_CONTENT"
          : "SOURCE_ID_NOT_FOUND",
    ],
  };
}

interface SourceCandidate {
  readonly document: BridgeDocumentRecord;
  readonly record: BridgeElementRecord;
}

function sourceMarkersFor(
  element: Element,
  context: PreparedSourceBindingContext,
): ElementMeasurement["runtime_elementor_markers"] {
  const cached = context.markersByElement.get(element);
  if (cached) return cached;
  const markers = runtimeElementorMarkers(element);
  context.markersByElement.set(element, markers);
  return markers;
}

function findSourceCandidates(
  context: PreparedSourceBindingContext,
  elementId: string,
): readonly SourceCandidate[] {
  return context.candidatesByElementId.get(elementId) ?? [];
}

function bindingFromCandidates(
  candidates: readonly SourceCandidate[],
  elementId: string | null,
  runtimeCount: number,
  pageDocumentId: string | null,
  pageEvidenceState: "MATCH" | "ABSENT" | "CONFLICT",
  basis: SourceBindingEvidence["binding_basis"],
  confirmation: SourceBindingEvidence["confirmation_state"],
  context: BindingContext,
  preparedContext: PreparedSourceBindingContext,
): SourceBindingEvidence {
  const sourceCount = candidates.reduce(
    (maximum, candidate) => Math.max(maximum, candidate.record.id_occurrence_count),
    candidates.length,
  );
  const candidate = candidates.length === 1 ? (candidates[0] ?? null) : null;
  const uniqueSource =
    candidate !== null && candidate.record.id_uniqueness === "UNIQUE" && sourceCount === 1;
  const uniqueRuntime = elementId !== null && runtimeCount === 1;
  const duplicateEvidence = candidates.length > 1 || sourceCount > 1 || runtimeCount > 1;
  const pageConflict = pageEvidenceState === "CONFLICT";
  const belongsToSelectedDocument =
    candidate !== null && candidate.document.document_id === context.selected_document?.document_id;
  const exact =
    uniqueSource &&
    uniqueRuntime &&
    !pageConflict &&
    (belongsToSelectedDocument ? pageEvidenceState === "MATCH" : true);
  const reasonCodes: string[] = [];
  if (pageConflict) reasonCodes.push("DOCUMENT_MISMATCH");
  else if (belongsToSelectedDocument && pageEvidenceState === "ABSENT")
    reasonCodes.push("PAGE_DOCUMENT_MARKER_NOT_OBSERVED");
  if (candidates.length > 1 || sourceCount > 1) reasonCodes.push("DUPLICATE_SOURCE_ID");
  if (runtimeCount > 1) reasonCodes.push("DUPLICATE_RUNTIME_ID");
  if (candidate && !belongsToSelectedDocument) reasonCodes.push("ADDITIONAL_SOURCE_DOCUMENT");
  if (!exact && !duplicateEvidence && !pageConflict) reasonCodes.push("BINDING_NOT_EXACT");
  const section = candidate ? findSourceSection(candidate, preparedContext) : null;

  return {
    availability: "AVAILABLE",
    binding_state: exact ? "EXACT" : pageConflict || duplicateEvidence ? "AMBIGUOUS" : "PROBABLE",
    binding_basis: basis,
    page_elementor_document_id: pageDocumentId,
    elementor_element_id: candidate ? elementId : null,
    nearest_elementor_ancestor_id: candidate?.record.parent_elementor_id ?? null,
    elementor_ancestor_ids: candidate?.record.ancestor_elementor_ids ?? [],
    runtime_id_occurrence_count: runtimeCount,
    source_id_occurrence_count: sourceCount,
    source_document_id: candidate?.document.document_id ?? null,
    source_element_key: candidate?.record.source_element_key ?? null,
    source_record_sha256: candidate?.record.source_record_sha256 ?? null,
    unique_in_runtime_document: uniqueRuntime,
    unique_in_source_document: uniqueSource,
    confirmation_state: confirmation,
    reason_codes: uniqueStrings(reasonCodes),
    source_document_type: candidate?.document.document_type ?? null,
    source_element_kind: candidate?.record.element_kind ?? null,
    source_widget_type: candidate?.record.widget_type ?? null,
    source_architecture_kind: candidate?.record.architecture_kind ?? null,
    source_editor_label: candidate?.record.editor_label ?? null,
    source_editor_label_source: candidate?.record.editor_label
      ? (candidate.record.editor_label_source ?? "ELEMENTOR_EDITOR_METADATA")
      : null,
    source_section_key: section?.source_element_key ?? null,
    source_section_element_id: section?.elementor_element_id ?? null,
    source_section_kind: section?.element_kind ?? null,
  };
}

const STRUCTURAL_SOURCE_KINDS = new Set([
  "section",
  "container",
  "inner_section",
  "e-div-block",
  "e-grid",
  "e-flexbox",
]);

function findSourceSection(
  source: SourceCandidate,
  context: PreparedSourceBindingContext,
): BridgeElementRecord | null {
  const cached = context.sectionByRecord.get(source.record);
  if (cached !== undefined) return cached;
  const recordsById = context.recordsByDocumentAndElementId.get(source.document.document_id);
  const ancestors = [...source.record.ancestor_elementor_ids].reverse();
  for (const ancestorId of ancestors) {
    const candidate = recordsById?.get(ancestorId) ?? null;
    if (candidate && isStructuralSourceRecord(candidate)) {
      context.sectionByRecord.set(source.record, candidate);
      return candidate;
    }
  }
  const section = isStructuralSourceRecord(source.record) ? source.record : null;
  context.sectionByRecord.set(source.record, section);
  return section;
}

function isStructuralSourceRecord(record: BridgeElementRecord): boolean {
  return (
    STRUCTURAL_SOURCE_KINDS.has(record.element_kind.toLowerCase()) ||
    STRUCTURAL_SOURCE_KINDS.has((record.el_type ?? "").toLowerCase()) ||
    STRUCTURAL_SOURCE_KINDS.has(record.architecture_kind.toLowerCase())
  );
}

function emptySourceMetadata(): Pick<
  SourceBindingEvidence,
  | "source_document_type"
  | "source_element_kind"
  | "source_widget_type"
  | "source_architecture_kind"
  | "source_editor_label"
  | "source_editor_label_source"
  | "source_section_key"
  | "source_section_element_id"
  | "source_section_kind"
> {
  return {
    source_document_type: null,
    source_element_kind: null,
    source_widget_type: null,
    source_architecture_kind: null,
    source_editor_label: null,
    source_editor_label_source: null,
    source_section_key: null,
    source_section_element_id: null,
    source_section_kind: null,
  };
}

function unmatchedBinding(
  runtimeCount: number,
  basis: SourceBindingEvidence["binding_basis"],
  reason: string,
): SourceBindingEvidence {
  return {
    ...emptySourceMetadata(),
    availability: "INSUFFICIENT",
    binding_state: "UNMATCHED",
    binding_basis: basis,
    page_elementor_document_id: null,
    elementor_element_id: null,
    nearest_elementor_ancestor_id: null,
    elementor_ancestor_ids: [],
    runtime_id_occurrence_count: runtimeCount,
    source_id_occurrence_count: null,
    source_document_id: null,
    source_element_key: null,
    source_record_sha256: null,
    unique_in_runtime_document: runtimeCount === 1,
    unique_in_source_document: null,
    confirmation_state: "NOT_CONFIRMED",
    reason_codes: [reason],
  };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function buildRuntimeRegions(
  prepared: readonly PreparedElement[],
  measurements: readonly ElementMeasurement[],
  emitted: ReadonlyMap<Element, string>,
  config: CaptureConfiguration,
): readonly RuntimeRegion[] {
  const candidates: Array<{
    readonly element: Element;
    readonly measurement: ElementMeasurement;
    readonly regionKind: RuntimeRegion["region_kind"];
  }> = [];
  for (const [index, item] of prepared.entries()) {
    const measurement = measurements[index];
    if (!measurement) continue;
    const regionKind = runtimeRegionKind(item.element, measurement.runtime_elementor_markers);
    if (regionKind) candidates.push({ element: item.element, measurement, regionKind });
  }
  const regionElements = new Set(candidates.map((item) => item.element));
  return candidates.map(({ element, measurement, regionKind }) => {
    let parent = element.parentElement;
    let parentRegionNodeId: string | null = null;
    let searched = 0;
    while (parent && searched < ANCESTOR_SEARCH_LIMIT) {
      if (regionElements.has(parent)) {
        parentRegionNodeId = emitted.get(parent) ?? null;
        break;
      }
      parent = parent.parentElement;
      searched += 1;
    }
    return {
      region_node_id: measurement.node_id,
      region_kind: regionKind,
      tag_name: element.tagName.toLowerCase(),
      landmark_role: landmarkRole(element),
      runtime_parent_region_node_id: parentRegionNodeId,
      source_binding_state: measurement.source_binding.binding_state,
      source_document_id: measurement.source_binding.source_document_id,
      source_section_key: measurement.source_binding.source_section_key,
      section_label: structureLabel(element, measurement, config),
      bounding_rect: measurement.bounding_rect,
    };
  });
}

function runtimeRegionKind(
  element: Element,
  markers: ElementMeasurement["runtime_elementor_markers"],
): RuntimeRegion["region_kind"] | null {
  const classes = new Set(markers.structure_class_markers);
  if (classes.has("elementor-section") || classes.has("elementor-inner-section"))
    return "ELEMENTOR_SECTION";
  if (classes.has("e-con") || classes.has("e-con-inner") || classes.has("elementor-container"))
    return "ELEMENTOR_CONTAINER";
  if (classes.has("e-grid") || classes.has("e-flexbox") || classes.has("e-div-block"))
    return "ATOMIC_CONTAINER";
  const tag = element.tagName.toLowerCase();
  if (["header", "main", "nav", "aside", "footer"].includes(tag) || landmarkRole(element))
    return "HTML_LANDMARK";
  if (["section", "article"].includes(tag)) return "HTML_SECTION";
  return null;
}

function landmarkRole(element: Element): string | null {
  const explicit = safeToken(element.getAttribute("role"));
  if (
    explicit &&
    [
      "banner",
      "main",
      "navigation",
      "contentinfo",
      "complementary",
      "region",
      "search",
      "form",
    ].includes(explicit)
  )
    return explicit;
  const implicit: Readonly<Record<string, string>> = {
    header: "banner",
    main: "main",
    nav: "navigation",
    aside: "complementary",
    footer: "contentinfo",
  };
  return implicit[element.tagName.toLowerCase()] ?? null;
}

function structureLabel(
  element: Element,
  measurement: ElementMeasurement,
  config: CaptureConfiguration,
): RuntimeRegion["section_label"] {
  const binding = measurement.source_binding;
  if (binding.source_editor_label) {
    return {
      value: binding.source_editor_label.slice(0, 300),
      source: "ELEMENTOR_EDITOR_LABEL",
      availability: "AVAILABLE",
    };
  }
  const htmlId =
    config.redactionMode === "STRICT" ? null : stableIdCandidate(element.getAttribute("id"));
  if (htmlId) return { value: htmlId, source: "HTML_ID", availability: "AVAILABLE" };
  const role = landmarkRole(element);
  if (role)
    return {
      value: `${element.tagName.toLowerCase()}:${role}`,
      source: "LANDMARK_TAG",
      availability: "AVAILABLE",
    };
  const technical = measurement.runtime_elementor_markers.structure_class_markers[0] ?? null;
  if (technical) return { value: technical, source: "TECHNICAL_MARKER", availability: "AVAILABLE" };
  return { value: null, source: "NONE", availability: "UNAVAILABLE" };
}

function buildPageStructureSummary(
  measurements: readonly ElementMeasurement[],
  regions: readonly RuntimeRegion[],
  documentInstances: readonly DocumentInstanceEvidence[],
): PageStructureSummary {
  const sourceDocuments = new Set(
    measurements
      .map((item) => item.source_binding.source_document_id)
      .filter((value): value is string => value !== null),
  );
  const sourceSections = new Set(
    measurements
      .map((item) => item.source_binding.source_section_key)
      .filter((value): value is HashDigest => value !== null),
  );
  return {
    source_document_count: sourceDocuments.size,
    source_section_count: sourceSections.size,
    source_widget_count: measurements.filter(
      (item) => item.source_binding.source_widget_type !== null,
    ).length,
    runtime_region_count: regions.length,
    runtime_section_region_count: regions.filter((region) =>
      ["HTML_SECTION", "ELEMENTOR_SECTION"].includes(region.region_kind),
    ).length,
    runtime_container_region_count: regions.filter((region) =>
      ["ELEMENTOR_CONTAINER", "ATOMIC_CONTAINER"].includes(region.region_kind),
    ).length,
    runtime_widget_marker_count: measurements.filter(
      (item) => item.runtime_elementor_markers.widget_class_markers.length > 0,
    ).length,
    exact_binding_count: measurements.filter(
      (item) => item.source_binding.binding_state === "EXACT",
    ).length,
    probable_binding_count: measurements.filter(
      (item) => item.source_binding.binding_state === "PROBABLE",
    ).length,
    ambiguous_binding_count: measurements.filter(
      (item) => item.source_binding.binding_state === "AMBIGUOUS",
    ).length,
    unmatched_runtime_node_count: measurements.filter(
      (item) => item.source_binding.binding_state === "UNMATCHED",
    ).length,
    document_instance_count: documentInstances.length,
    repeated_runtime_instance_group_count: new Set(
      measurements
        .filter((item) => item.runtime_instance.instance_state === "REPEATED_TEMPLATE")
        .map((item) => item.runtime_instance.instance_group_id)
        .filter((value): value is HashDigest => value !== null),
    ).size,
  };
}

function buildSourceDocumentsPresent(
  measurements: readonly ElementMeasurement[],
  context: BindingContext | null,
): readonly SourceDocumentPresence[] {
  if (!context) return [];
  const grouped = new Map<string, BindingState[]>();
  for (const measurement of measurements) {
    const documentId = measurement.source_binding.source_document_id;
    if (!documentId) continue;
    const states = grouped.get(documentId) ?? [];
    states.push(measurement.source_binding.binding_state);
    grouped.set(documentId, states);
  }
  const selectedId = context.selected_document?.document_id ?? null;
  if (selectedId && !grouped.has(selectedId)) grouped.set(selectedId, []);
  return [...grouped.entries()]
    .map(([documentId, states]) => {
      const source = context.documents.find((document) => document.document_id === documentId);
      if (!source) return null;
      return {
        document_id: source.document_id,
        document_type: source.document_type,
        document_fingerprint: source.document_fingerprint,
        binding_states: uniqueStrings(states),
        bound_runtime_node_count: states.length,
      };
    })
    .filter((value): value is SourceDocumentPresence => value !== null)
    .sort((left, right) => left.document_id.localeCompare(right.document_id));
}

async function buildRelationships(
  element: Element,
  emitted: ReadonlyMap<Element, string>,
  context: CaptureMeasurementContext,
): Promise<RelationshipEvidence> {
  const parent = element.parentElement;
  const parentReference = parent ? stableDomReference(parent, context.identity) : null;
  const ancestors = ancestorMeasurementsFor(element, context);
  const positioned = ancestors.nearestPositioned;
  const scroll = ancestors.nearestScroll;
  const clipping = ancestors.nearestClipping;
  const nearestEmitted = nearestEmittedAncestor(element, emitted);
  return {
    dom_parent_reference: parentReference,
    dom_parent_reference_sha256: parentReference ? await sha256Digest(parentReference) : null,
    dom_parent_emitted: parent ? emitted.has(parent) : false,
    nearest_emitted_parent_node_id: nearestEmitted ? (emitted.get(nearestEmitted) ?? null) : null,
    nearest_positioned_ancestor_reference: positioned
      ? stableDomReference(positioned, context.identity)
      : null,
    nearest_positioned_ancestor_node_id: positioned ? (emitted.get(positioned) ?? null) : null,
    nearest_scroll_ancestor_reference: scroll ? stableDomReference(scroll, context.identity) : null,
    nearest_scroll_ancestor_node_id: scroll ? (emitted.get(scroll) ?? null) : null,
    nearest_clipping_ancestor_reference: clipping
      ? stableDomReference(clipping, context.identity)
      : null,
    nearest_clipping_ancestor_node_id: clipping ? (emitted.get(clipping) ?? null) : null,
    sibling_index: structuralOrdinals(element, context.identity).siblingIndex,
    sibling_count: element.parentElement?.children.length ?? 1,
    child_element_count: element.children.length,
    dom_depth: domDepth(element),
    availability: "AVAILABLE",
  };
}

function disabledRelationships(
  element: Element,
  context: CaptureMeasurementContext,
): RelationshipEvidence {
  return {
    dom_parent_reference: null,
    dom_parent_reference_sha256: null,
    dom_parent_emitted: false,
    nearest_emitted_parent_node_id: null,
    nearest_positioned_ancestor_reference: null,
    nearest_positioned_ancestor_node_id: null,
    nearest_scroll_ancestor_reference: null,
    nearest_scroll_ancestor_node_id: null,
    nearest_clipping_ancestor_reference: null,
    nearest_clipping_ancestor_node_id: null,
    sibling_index: structuralOrdinals(element, context.identity).siblingIndex,
    sibling_count: element.parentElement?.children.length ?? 1,
    child_element_count: element.children.length,
    dom_depth: domDepth(element),
    availability: "DISABLED",
  };
}

function collectInteractionFacts(element: Element, style: CSSStyleDeclaration): InteractionFacts {
  const html = element instanceof HTMLElement ? element : null;
  const tag = element.tagName.toLowerCase();
  const inputType = element instanceof HTMLInputElement ? sanitizeInputType(element.type) : null;
  return {
    availability: "AVAILABLE",
    tag_name: tag,
    role: safeToken(element.getAttribute("role")),
    native_interactive_kind: nativeInteractiveKind(element),
    tab_index: html ? html.tabIndex : null,
    disabled: isDisabled(element),
    aria_disabled: booleanAttribute(element, "aria-disabled"),
    aria_expanded: booleanAttribute(element, "aria-expanded"),
    aria_controls_present: element.hasAttribute("aria-controls"),
    href_present:
      (element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement) &&
      element.hasAttribute("href"),
    input_type: inputType,
    contenteditable: Boolean(html?.isContentEditable),
    pointer_events: style.pointerEvents,
    cursor: style.cursor,
  };
}
function disabledInteractionFacts(element: Element, style: CSSStyleDeclaration): InteractionFacts {
  return { ...collectInteractionFacts(element, style), availability: "DISABLED" };
}

function collectTextShape(
  element: Element,
  style: CSSStyleDeclaration,
  clientWidth: number,
  clientHeight: number,
  scrollWidth: number,
  scrollHeight: number,
  includePreview: boolean,
  maximumCharacters: number,
  context: TextMeasurementContext | null,
): TextShapeEvidence {
  const tag = element.tagName.toLowerCase();
  if (["input", "textarea", "select", "option"].includes(tag))
    return excludedTextShape(style, "EXCLUDED_SENSITIVE_CONTROL");
  if (isEditableElement(element)) return excludedTextShape(style, "EXCLUDED_CONTENTEDITABLE");
  if (["script", "style", "template"].includes(tag)) return excludedTextShape(style, "NO_TEXT");

  const collection = context?.collections.get(element) ?? collectTextNodes(element);
  if (collection.text.length === 0) {
    if (collection.limitReached)
      return {
        ...excludedTextShape(style, "BOUNDED_LIMIT_REACHED"),
        availability: "PARTIAL",
      };
    return excludedTextShape(style, "NO_TEXT");
  }
  const bounded = collection.limitReached;
  const lineCount = measureLineBoxes(collection.nodes, context);
  const previewSource = includePreview
    ? redactPreview(collection.text.replace(/\s+/g, " ").trim())
    : null;
  const previewTruncated = previewSource !== null && previewSource.length > maximumCharacters;
  return {
    availability: bounded ? "PARTIAL" : "AVAILABLE",
    measurement_status: bounded ? "BOUNDED_LIMIT_REACHED" : "MEASURED",
    measurement_method: lineCount === null ? "TEXT_CONTENT_SHAPE" : "RANGE_CLIENT_RECTS",
    text_present: true,
    text_node_count: collection.nodes.length,
    grapheme_count: countGraphemes(collection.text),
    word_count: countWords(collection.text),
    rendered_line_box_count: lineCount,
    longest_unbroken_token_length: longestToken(collection.text),
    white_space: style.whiteSpace,
    overflow_wrap: style.overflowWrap,
    word_break: style.wordBreak,
    text_overflow: style.textOverflow,
    line_clamp: parseLineClamp(style),
    horizontal_clipping:
      scrollWidth > clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX),
    vertical_clipping:
      scrollHeight > clientHeight + 1 && ["hidden", "clip"].includes(style.overflowY),
    preview: previewSource === null ? null : previewSource.slice(0, maximumCharacters),
    preview_truncated: previewTruncated,
  };
}
function disabledTextShape(style: CSSStyleDeclaration): TextShapeEvidence {
  return { ...excludedTextShape(style, "UNAVAILABLE"), availability: "DISABLED" };
}
function excludedTextShape(
  style: CSSStyleDeclaration,
  status: TextShapeEvidence["measurement_status"],
): TextShapeEvidence {
  return {
    availability: status === "NO_TEXT" ? "NOT_APPLICABLE" : "INSUFFICIENT",
    measurement_status: status,
    measurement_method: "NONE",
    text_present: false,
    text_node_count: 0,
    grapheme_count: null,
    word_count: null,
    rendered_line_box_count: null,
    longest_unbroken_token_length: null,
    white_space: style.whiteSpace,
    overflow_wrap: style.overflowWrap,
    word_break: style.wordBreak,
    text_overflow: style.textOverflow,
    line_clamp: parseLineClamp(style),
    horizontal_clipping: false,
    vertical_clipping: false,
    preview: null,
    preview_truncated: false,
  };
}

function prepareTextMeasurementContext(elements: readonly Element[]): TextMeasurementContext {
  const collections = new WeakMap<Element, TextNodeCollection>();
  const lineEvidence = new WeakMap<Text, TextNodeLineEvidence | null>();
  if (elements.length === 0) return { collections, lineEvidence };

  interface MutableCollection {
    readonly nodes: Text[];
    readonly parts: string[];
    textLength: number;
    limitReached: boolean;
  }

  const mutable = new Map<Element, MutableCollection>();
  for (const element of elements)
    mutable.set(element, { nodes: [], parts: [], textLength: 0, limitReached: false });

  const document = elements[0]?.ownerDocument;
  if (document) {
    const selected = new Set(elements);
    const roots = elements.filter((element) => !hasSelectedAncestor(element, selected));
    let scannedNodes = 0;
    let scannedCharacters = 0;
    let ancestorSteps = 0;
    let budgetReached = false;
    let activeCollections = mutable.size;

    scan: for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (activeCollections === 0) break scan;
        const node = walker.currentNode as Text;
        scannedNodes += 1;
        scannedCharacters += node.data.length;
        if (scannedNodes > TEXT_SCAN_NODE_LIMIT || scannedCharacters > TEXT_SCAN_CHARACTER_LIMIT) {
          budgetReached = true;
          break scan;
        }

        let current = node.parentElement;
        let excluded = false;
        while (current) {
          ancestorSteps += 1;
          if (ancestorSteps > TEXT_SCAN_ANCESTOR_STEP_LIMIT) {
            budgetReached = true;
            break scan;
          }
          const tag = current.tagName.toLowerCase();
          if (
            ["input", "textarea", "select", "option", "script", "style", "template"].includes(
              tag,
            ) ||
            isEditableElement(current)
          ) {
            excluded = true;
            break;
          }
          if (current === root) break;
          current = current.parentElement;
        }
        if (excluded) continue;

        current = node.parentElement;
        while (current) {
          ancestorSteps += 1;
          if (ancestorSteps > TEXT_SCAN_ANCESTOR_STEP_LIMIT) {
            budgetReached = true;
            break scan;
          }
          const collection = mutable.get(current);
          if (collection && !collection.limitReached) {
            const accepted = appendTextNode(collection, node);
            if (!accepted) activeCollections -= 1;
          }
          if (current === root) break;
          current = current.parentElement;
        }
      }
    }

    if (budgetReached) for (const collection of mutable.values()) collection.limitReached = true;
  }

  for (const [element, collection] of mutable) {
    collections.set(element, {
      nodes: collection.nodes,
      text: collection.parts.join(" ").trim(),
      limitReached: collection.limitReached,
    });
  }
  return { collections, lineEvidence };
}

function hasSelectedAncestor(element: Element, selected: ReadonlySet<Element>): boolean {
  let current = element.parentElement;
  while (current) {
    if (selected.has(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function collectTextNodes(element: Element): TextNodeCollection {
  const collection = {
    nodes: [] as Text[],
    parts: [] as string[],
    textLength: 0,
    limitReached: false,
  };
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (isExcludedTextNode(node, element)) continue;
    if (!appendTextNode(collection, node)) break;
  }
  return {
    nodes: collection.nodes,
    text: collection.parts.join(" ").trim(),
    limitReached: collection.limitReached,
  };
}

function appendTextNode(
  collection: {
    readonly nodes: Text[];
    readonly parts: string[];
    textLength: number;
    limitReached: boolean;
  },
  node: Text,
): boolean {
  if (
    collection.nodes.length >= TEXT_NODE_LIMIT ||
    collection.textLength + node.data.length > TEXT_CHARACTER_LIMIT
  ) {
    collection.limitReached = true;
    return false;
  }
  collection.nodes.push(node);
  collection.parts.push(node.data);
  collection.textLength += node.data.length + 1;
  return true;
}

function isEditableElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const value = element.getAttribute("contenteditable");
  return value !== null && value.toLowerCase() !== "false";
}

function isExcludedTextNode(node: Text, boundary: Element): boolean {
  let current: Element | null = node.parentElement;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (["input", "textarea", "select", "option"].includes(tag)) return true;
    if (["script", "style", "template"].includes(tag)) return true;
    if (isEditableElement(current)) return true;
    if (current === boundary) return false;
    current = current.parentElement;
  }
  return true;
}

function measureLineBoxes(
  nodes: readonly Text[],
  context: TextMeasurementContext | null,
): number | null {
  const tops = new Set<string>();
  let rectCount = 0;
  try {
    for (const node of nodes) {
      const evidence = lineEvidenceForNode(node, context);
      if (evidence === null) return null;
      rectCount += evidence.rectCount;
      if (rectCount >= LINE_RECT_LIMIT) return null;
      for (const top of evidence.tops) tops.add(top);
    }
    return tops.size;
  } catch {
    return null;
  }
}

function lineEvidenceForNode(
  node: Text,
  context: TextMeasurementContext | null,
): TextNodeLineEvidence | null {
  if (context) {
    const cached = context.lineEvidence.get(node);
    if (cached !== undefined) return cached;
  }
  try {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const tops = new Set<string>();
    let rectCount = 0;
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      tops.add(rect.top.toFixed(2));
      rectCount += 1;
      if (rectCount >= LINE_RECT_LIMIT) {
        context?.lineEvidence.set(node, null);
        return null;
      }
    }
    const evidence: TextNodeLineEvidence = { tops: [...tops], rectCount };
    context?.lineEvidence.set(node, evidence);
    return evidence;
  } catch {
    context?.lineEvidence.set(node, null);
    return null;
  }
}

function countGraphemes(value: string): number {
  if (!GRAPHEME_SEGMENTER) return Array.from(value).length;
  let count = 0;
  const iterator = GRAPHEME_SEGMENTER.segment(value)[Symbol.iterator]();
  while (!iterator.next().done) count += 1;
  return count;
}

function countWords(value: string): number {
  if (!WORD_SEGMENTER) return value.trim().split(/\s+/u).filter(Boolean).length;
  let count = 0;
  for (const segment of WORD_SEGMENTER.segment(value)) if (segment.isWordLike) count += 1;
  return count;
}

function longestToken(value: string): number {
  return value.split(/\s+/u).reduce((max, token) => Math.max(max, Array.from(token).length), 0);
}
function parseLineClamp(style: CSSStyleDeclaration): number | null {
  const value = style.getPropertyValue("-webkit-line-clamp");
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite element dimension.");
  return normalizeFiniteNumber(value);
}
function finiteOpacity(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? normalizeFiniteNumber(parsed) : null;
}
function nodeId(index: number): string {
  return `node-${String(index + 1).padStart(6, "0")}`;
}
function domDepth(element: Element): number {
  let depth = 0;
  let current = element.parentElement;
  while (current && depth < 10_000) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}
function nearestEmittedAncestor(
  element: Element,
  emitted: ReadonlyMap<Element, string>,
): Element | null {
  let current = element.parentElement;
  let count = 0;
  while (current && count < ANCESTOR_SEARCH_LIMIT) {
    if (emitted.has(current)) return current;
    current = current.parentElement;
    count += 1;
  }
  return null;
}
function pageDocumentEvidence(
  document: Document,
  selectedDocumentId: string,
): { pageElementorDocumentId: string | null; state: "MATCH" | "ABSENT" | "CONFLICT" } {
  const values = [
    ...new Set(
      [...document.querySelectorAll("[data-elementor-id]")]
        .map((element) => element.getAttribute("data-elementor-id"))
        .filter((value): value is string => value !== null && value.length > 0),
    ),
  ];
  if (values.length === 0) return { pageElementorDocumentId: null, state: "ABSENT" };
  if (values.length === 1 && values[0] === selectedDocumentId)
    return { pageElementorDocumentId: selectedDocumentId, state: "MATCH" };
  return { pageElementorDocumentId: null, state: "CONFLICT" };
}
function nativeInteractiveKind(element: Element): string | null {
  if (element instanceof HTMLButtonElement) return "BUTTON";
  if (element instanceof HTMLAnchorElement) return "ANCHOR";
  if (element instanceof HTMLInputElement) return "INPUT";
  if (element instanceof HTMLSelectElement) return "SELECT";
  if (element instanceof HTMLTextAreaElement) return "TEXTAREA";
  if (element instanceof HTMLDetailsElement) return "DETAILS";
  if (element.tagName.toLowerCase() === "summary") return "SUMMARY";
  return null;
}
function isDisabled(element: Element): boolean {
  return "disabled" in element && Boolean((element as Element & { disabled?: boolean }).disabled);
}
function booleanAttribute(element: Element, name: string): boolean | null {
  const value = element.getAttribute(name);
  if (value === null) return null;
  return value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : null;
}
function safeToken(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/.test(normalized) ? normalized : null;
}
function sanitizeInputType(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,31}$/.test(normalized) ? normalized : null;
}
function redactPreview(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[REDACTED_TOKEN]")
    .replace(
      /\b(?:bearer|token|secret|password)\s*[:=]?\s*[A-Za-z0-9._~+/-]{8,}\b/gi,
      "[REDACTED_TOKEN]",
    )
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[REDACTED_NUMBER]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[REDACTED_TOKEN]");
}
