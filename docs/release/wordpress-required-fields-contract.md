# Final WordPress Required Fields Contract

Contract target: EDIS WordPress Evidence Exporter 3.2.0 → EDIS Browser Runtime Collector 1.6.4

The Browser imports only `bridge/source-context.json`, through explicit local user action. It does not need or accept complete raw WordPress documents for runtime capture.

## Required site scope

- `schema_id`
- `schema_version`
- `analysis_set_id`
- `wordpress_bundle_id`
- `source_export_root_sha256`
- `site_fingerprint`
- `url_normalization_profile`
- `site_locator_candidates`
- `multisite_mode`
- `site_path_scope`
- `source_truth_state`
- `source_availability`

## Required document records

- `document_id` as a string
- `document_type`
- `document_fingerprint`
- `saved_source_sha256`
- `page_locator_candidates`
- `public_routability`
- `source_storage_kind`
- `source_state`
- `architecture_kinds`
- `source_truth_state`
- `source_availability`

## Required element-index records

- `document_id`
- `source_element_key`
- `source_record_sha256`
- `elementor_element_id`
- `id_occurrence_count`
- `id_uniqueness`
- `parent_elementor_id`
- `ancestor_elementor_ids` in root-to-leaf order, excluding the current element
- `source_path`
- `document_order`
- `element_kind`
- `el_type`
- `widget_type`
- `architecture_kind`
- `source_truth_state`
- `source_availability`

## Contract rules

- Hash algorithms are written as `sha256`.
- Digests use `sha256:<64 lowercase hexadecimal characters>`.
- `analysis_set_id` is a UUID v4 owned by WordPress and is operational, not semantic.
- `source_export_root_sha256` excludes package manifest, checksums, validation artifacts, Bridge Context, and signatures.
- The ambiguous field `elementor_id` is forbidden in new shared contracts.
- Duplicate IDs are preserved and diagnosed; they are never silently made unique.
- Page/document identity and element identity remain separate.
- WordPress does not export runtime geometry, computed styles, DOM selectors, runtime relationships, or final correlation.

## Optional enrichment used by Browser 1.6.4

The following fields are optional and must be exported only when they are explicit saved-source evidence:

- `editor_label`
- `editor_label_source`, currently `ELEMENTOR_EDITOR_METADATA` when applicable

They allow the Browser to preserve an explicit source label for widget/section evidence. Their absence must remain absence; Browser does not infer semantic names. Browser derives the nearest source section only from the imported ancestor chain and structural element kinds.

For rendered pages containing several source documents, Bridge Context should include all bounded document and element-index records that may be present, including page, header, footer, popup, loop, or template documents. Browser may establish preliminary binding to a non-selected additional document while keeping the selected rendered-page document separate.
