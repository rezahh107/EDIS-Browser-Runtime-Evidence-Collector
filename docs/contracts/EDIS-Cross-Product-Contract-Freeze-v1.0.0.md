# EDIS Cross-Product Contract Freeze

**Contract version:** 1.0.0  
**Status:** FROZEN  
**Applies to:**

- EDIS WordPress Evidence Exporter 3.2.0
- EDIS Browser Runtime Collector 1.5.0
- EDIS Python Deterministic Truth Engine
- LLM Explanation Layer

---

## 1. Architectural boundary

The following separation is final:

```text
WordPress Evidence Exporter
    Saved WordPress and Elementor source evidence
    Source declarations, references, registries, provenance,
    capabilities, and deterministic lightweight indexes

Browser Runtime Collector
    Rendered runtime observations
    DOM identity and source-binding evidence
    Geometry, computed styles, relationships,
    interaction facts, text shape, and capture readiness

Python Deterministic Truth Engine
    Package verification
    Source/runtime joining
    Final correlation
    Inheritance and effective-value resolution
    Formula and rule execution
    Findings, metrics, risks, and scores

LLM
    Explanation
    Prioritization
    Human-readable guidance
```

Neither collector may perform:

- UX scoring
- policy evaluation
- recommendation generation
- final source/runtime resolution
- responsive effective-value inference
- Variable or Global Class resolution
- Fitts, Hick, Gestalt, grid, typography, or responsive-quality rules

---

## 2. Final state dimensions

The following concepts must remain independent:

```text
source_truth_state
source_availability
runtime_availability
binding_state
final_correlation_state
validation_state
job_execution_state
```

### 2.1 Source truth state

Owned by WordPress and preserved by Python:

```text
VERIFIED
PARTIAL
UNKNOWN
UNSUPPORTED
```

Meaning: confidence in the source collector or source contract.

### 2.2 Shared evidence availability

Used in namespaced source/runtime/module fields:

```text
AVAILABLE
PARTIAL
INSUFFICIENT
DISABLED
UNAVAILABLE
NOT_APPLICABLE
ERROR
```

`UNSUPPORTED` is not an availability value.

### 2.3 Browser binding state

Owned by Browser as preliminary evidence:

```text
EXACT
PROBABLE
AMBIGUOUS
UNMATCHED
```

### 2.4 Final correlation state

Owned only by Python:

```text
EXACT
PROBABLE
AMBIGUOUS
UNMATCHED
```

Browser binding is not final correlation.

### 2.5 Validation state

```text
PASS
FAIL
NOT_RUN
```

### 2.6 User confirmation

User confirmation is provenance only:

```text
NOT_CONFIRMED
CONFIRMED
```

It must never convert ambiguous or duplicate evidence to `EXACT`.

---

## 3. Shared artifact envelope

Every shared JSON artifact uses:

```json
{
  "schema_id": "urn:edis:schema:...",
  "schema_version": "1.0.0",
  "artifact_type": "...",
  "producer": {
    "product": "...",
    "version": "..."
  },
  "captured_at": "...",
  "canonicalization": {
    "profile": "EDIS-CJ-1",
    "hash_algorithm": "sha256"
  },
  "data": {},
  "diagnostics": []
}
```

Rules:

- `schema_id` is mandatory.
- No generic `status` field is allowed.
- Artifact-specific states live inside typed `data`.
- Binary screenshots, `checksums.sha256`, and raw signature files do not use this envelope.
- `captured_at` participates in full-file integrity but not semantic identity unless explicitly overridden by schema.

---

## 4. Hash representation

Machine-readable contracts use:

```text
algorithm: sha256
digest: sha256:<64 lowercase hexadecimal characters>
```

Do not mix:

- `SHA-256`
- `sha256`
- bare digests

inside shared machine contracts.

---

## 5. Diagnostic contract

Every diagnostic uses:

```json
{
  "code": "EDIS_...",
  "severity": "INFO",
  "scope": "SEMANTIC",
  "message_key": "diagnostic.example",
  "context": {}
}
```

Enums:

```text
severity:
INFO
WARNING
ERROR

scope:
SEMANTIC
OPERATIONAL
```

Only semantic diagnostics contribute to semantic identity.

Localized message text never participates in semantic hashes.

---

## 6. Shared identifiers

### 6.1 analysis_set_id

Owner: WordPress  
Format: UUID v4  
Purpose: groups one coordinated source export with related runtime observations  
Semantic identity: excluded

Browser copies it only after importing valid Bridge Context. Browser-only captures use `null`.

### 6.2 wordpress_bundle_id

Owner: WordPress  
Format: UUID  
Operational only.

### 6.3 runtime_bundle_id

Owner: Browser  
Format: UUID  
Operational only.

### 6.4 document_id

Shared type:

```text
string
```

WordPress numeric post IDs are serialized as decimal strings.

### 6.5 site_fingerprint

Owner: WordPress  
Format:

```text
sha256:<digest>
```

It is matching evidence, not proof by itself.

### 6.6 page_fingerprint

Owner: Browser  
Format:

```text
sha256:<digest>
```

Derived from normalized locator facts and bounded runtime document markers.

### 6.7 document_fingerprint

Owner: WordPress  
Format:

```text
sha256:<digest>
```

Represents source document identity facts, not saved content bytes.

### 6.8 page_locator_sha256

Shared matching evidence based on EDIS-URL-1.

A matching locator hash alone never proves exact document identity.

### 6.9 saved_source_sha256

Owner: WordPress  
Hash of canonical saved source artifact.

### 6.10 snapshot_id

Owner: Browser  
Operational observation identifier.

### 6.11 observation_set_id

Owner: Browser  
Operational identifier for a compatible observation set.

### 6.12 source_element_key

Owner: WordPress  
Format:

```text
sha256:<digest>
```

Recommended canonical input:

```json
{
  "document_fingerprint": "...",
  "source_path": "elements[0].elements[2]",
  "elementor_element_id": "7f18a2c",
  "document_order": 18,
  "architecture_kind": "legacy"
}
```

Do not use ambiguous concatenated keys.

### 6.13 correlation_key_sha256

Owner: Python  
Deterministic semantic identity of a source/runtime candidate pair.

Suggested input:

```json
{
  "correlation_algorithm_version": "...",
  "document_fingerprint": "...",
  "source_element_key": "...",
  "runtime_reference_sha256": "..."
}
```

### 6.14 correlation_result_sha256

Owner: Python  
Hash of the complete final correlation result, including:

- final state
- reason codes
- selected evidence
- ambiguity records
- algorithm version

Operational bundle and snapshot IDs remain separate.

---

## 7. URL normalization profile: EDIS-URL-1

The profile hashes a canonical object rather than a raw URL string:

```json
{
  "scheme": "https",
  "host_ascii": "example.com",
  "port": null,
  "path": "/localized/page",
  "site_path_scope": "/"
}
```

Rules:

- reject credentials
- lowercase scheme and host
- convert host through standards-based ASCII serialization
- remove default ports
- preserve non-default ports
- remove dot segments using standards-based URL parsing
- preserve meaningful path case
- preserve repeated slashes
- normalize empty path to `/`
- remove fragment
- exclude query by default
- normalize percent-encoding for unreserved characters only
- use uppercase hex for retained escapes
- apply deterministic redaction/rejection to credential-like, nonce-like, token-like, email-like, and oversized path segments

Important:

- locator hashes are evidence, not proof
- drafts, previews, revisions, templates, popups, headers, footers, archives, 404 documents, reverse proxies, multisite, and differing public/internal origins require additional evidence
- Browser must not infer Elementor breakpoint names from viewport width

EDIS-URL-1 is operationally accepted only after common golden vectors pass in PHP, JavaScript, and Python.

---

## 8. Canonical JSON profile: EDIS-CJ-1

The profile must define and test:

- key ordering
- nested objects and arrays
- empty values
- Unicode policy
- Persian and RTL strings
- escaped characters
- control characters
- forward slashes
- integers
- negative zero
- fractions
- exponent notation
- large integers
- null and booleans
- rejection of NaN
- rejection of Infinity
- UTF-8 bytes
- final newline policy

No implementation may rely on a language’s default JSON serializer.

Unicode must not be normalized unless the profile explicitly requires it.

EDIS-CJ-1 is operationally accepted only after common golden vectors pass in PHP, JavaScript, and Python.

---

## 9. Bridge Context

Browser 1.5.0 supports explicit local import of:

```text
bridge/source-context.json
```

Rules:

- explicit user action only
- local parsing only
- no WordPress request
- no network synchronization
- no execution of imported content
- strict schema validation
- bounded file size, nesting, strings, document count, and element count
- prototype-pollution key rejection
- imported artifact hash recorded
- capture without Bridge Context remains valid
- missing context is not a capture failure

### 9.1 Required site fields

```text
schema_id
schema_version
analysis_set_id
wordpress_bundle_id
source_export_root_sha256
site_fingerprint
url_normalization_profile
site_locator_candidates
multisite_mode
site_path_scope
source_truth_state
source_availability
```

### 9.2 Required document fields

```text
document_id
document_type
document_fingerprint
saved_source_sha256
page_locator_candidates
public_routability
source_storage_kind
source_state
architecture_kinds
source_truth_state
source_availability
```

### 9.3 Required element-index fields

```text
document_id
source_element_key
source_record_sha256
elementor_element_id
id_occurrence_count
id_uniqueness
parent_elementor_id
ancestor_elementor_ids
source_path
document_order
element_kind
el_type
widget_type
architecture_kind
source_truth_state
source_availability
```

The Bridge Context must not embed full raw WordPress documents.

---

## 10. Hash-cycle prevention

`source-context.json` must not embed the final package-manifest hash.

Use:

```text
source_export_root_sha256
```

It is computed from the canonical ordered list of:

```text
relative artifact path
artifact sha256
artifact size
```

Excluded classes:

```text
package-manifest.json
checksums.sha256
validation artifacts
bridge/source-context.json
signature artifacts
```

Included path classes must be schema-declared.

Browser records:

```text
imported_source_context_sha256
source_export_root_sha256
wordpress_bundle_id
```

Python validates the complete WordPress bundle independently.

---

## 11. Elementor marker semantics

Browser stores raw marker facts separately from interpretation:

```json
{
  "runtime_elementor_markers": {
    "data_elementor_id": "123",
    "data_id": "7f18a2c",
    "elementor_class_marker_present": true
  }
}
```

Interpreted fields:

```text
page_elementor_document_id
elementor_element_id
```

These may be populated only when supported by:

- valid imported context
- selected source document
- source-index uniqueness
- marker placement
- absence of conflicting evidence

The generic field `elementor_id` is forbidden in new shared contracts because it conflates page/document and element identity.

---

## 12. Ancestor-chain semantics

For WordPress and Browser:

```text
ordering: root → leaf
current element: excluded
current element ID: stored separately
missing IDs: omitted
duplicate IDs: preserved with diagnostics
```

---

## 13. Browser source binding

Browser emits preliminary source-binding evidence only.

Example:

```json
{
  "source_binding": {
    "binding_state": "EXACT",
    "binding_basis": "DIRECT_VALIDATED_MARKER",
    "page_elementor_document_id": "123",
    "elementor_element_id": "7f18a2c",
    "nearest_elementor_ancestor_id": "5ba8821",
    "elementor_ancestor_ids": ["root123", "5ba8821"],
    "runtime_id_occurrence_count": 1,
    "source_id_occurrence_count": 1,
    "source_document_id": "123",
    "source_element_key": "sha256:...",
    "source_record_sha256": "sha256:...",
    "unique_in_runtime_document": true,
    "unique_in_source_document": true,
    "confirmation_state": "NOT_CONFIRMED",
    "reason_codes": []
  }
}
```

Browser must not produce:

- final correlation records
- correlation result hashes
- resolved source references
- effective values
- UX conclusions

---

## 14. Relationship graph

Each emitted runtime element records:

```text
dom_parent_reference
dom_parent_reference_sha256
dom_parent_emitted
nearest_emitted_parent_node_id
nearest_positioned_ancestor_reference
nearest_positioned_ancestor_node_id
nearest_scroll_ancestor_reference
nearest_scroll_ancestor_node_id
nearest_clipping_ancestor_reference
nearest_clipping_ancestor_node_id
sibling_index
sibling_count
child_element_count
dom_depth
```

Rules:

- `dom_parent_reference` describes the real DOM parent.
- `nearest_emitted_parent_node_id` describes the nearest ancestor included in the bounded snapshot.
- These two facts must never replace one another.
- Ancestor searches are bounded and emit partial/insufficient diagnostics when limits are reached.

---

## 15. Interaction facts

Browser records facts only:

```text
availability
tag_name
role
native_interactive_kind
tab_index
disabled
aria_disabled
aria_expanded
aria_controls_present
href_present
input_type
contenteditable
pointer_events
cursor
```

Browser must not export:

- href values
- form values
- input contents
- event handlers
- form actions
- accessible names by default
- aria-controls values

Python decides whether an element is interactive and applies interaction rules.

---

## 16. Privacy-safe text shape

Browser may record:

```text
availability
measurement_status
measurement_method
text_present
text_node_count
grapheme_count
word_count
rendered_line_box_count
longest_unbroken_token_length
white_space
overflow_wrap
word_break
text_overflow
line_clamp
horizontal_clipping
vertical_clipping
```

Measurement states:

```text
MEASURED
NO_TEXT
EXCLUDED_SENSITIVE_CONTROL
EXCLUDED_CONTENTEDITABLE
UNAVAILABLE
BOUNDED_LIMIT_REACHED
ERROR
```

Default exclusions:

- password controls
- hidden inputs
- form control values
- textarea values
- contenteditable content
- script/style/template content

Raw text preview remains separate, optional, and disabled by default.

---

## 17. Capture readiness

The Browser readiness process:

- hard maximum duration
- no DOM mutation
- no animation stopping
- no persistent observers
- capture continues after timeout
- instability is recorded as evidence

Observed fields:

```text
document_ready_state
fonts_api_available
fonts_status
incomplete_image_count
active_animation_count
initial_document_width
final_document_width
initial_document_height
final_document_height
initial_viewport_width
final_viewport_width
initial_viewport_height
final_viewport_height
sample_count
settle_duration_ms
hard_timeout_ms
timeout_reached
```

Derived process states:

```text
STABLE
UNSTABLE
TIMEOUT
INSUFFICIENT
ERROR
```

These are process facts, not design-quality conclusions.

---

## 18. Observation sets

Browser owns `observation_set_id`.

A set may include multiple observations only when:

- normalized page facts are compatible; or
- imported source context maps them to the same selected document.

Each observation records:

```text
observation_index
snapshot_id
user_label
captured_at
measured_viewport_width
measured_viewport_height
page_fingerprint
runtime_structure_sha256
```

Rules:

- labels are descriptive only
- measured dimensions are authoritative
- changed DOM does not automatically invalidate a set
- Browser must not assign Elementor breakpoint names from viewport width
- Python performs final cross-observation matching

---

## 19. Coverage artifacts

The following coverage artifacts remain distinct:

```text
source-coverage
runtime-coverage
source-binding-coverage
merged-correlation-coverage
```

Ownership:

| Artifact | Owner |
|---|---|
| Source Coverage | WordPress |
| Runtime Coverage | Browser |
| Source Binding Coverage | Browser |
| Merged Correlation Coverage | Python |

Collectors must not produce a shared readiness score for Python rules.

---

## 20. Truth and availability propagation

Dependencies must declare:

```text
REQUIRED
OPTIONAL
CONDITIONAL
```

Rules:

```text
Required UNSUPPORTED
    → output source truth cannot exceed UNSUPPORTED

Required UNKNOWN
    → output source truth cannot exceed UNKNOWN

Required PARTIAL
    → output source truth cannot exceed PARTIAL

Required ERROR or UNAVAILABLE
    → output availability becomes ERROR or UNAVAILABLE

Optional missing input
    → does not automatically make output unsupported
    → may reduce availability or coverage to PARTIAL

Conditional input
    → applies only when its declared condition is true
```

A deterministic index may be `VERIFIED` only when:

- its algorithm is verified
- every required input contract is verified
- every required input is available
- execution succeeds
- output invariants pass

---

## 21. WordPress package layout

```text
package-manifest.json
checksums.sha256

bridge/
  source-context.json

environment/
sources/
indexes/

coverage/
  source-coverage.json

provenance/
diagnostics/
validation/
schemas/
```

Optional directories/files are emitted only when they contain declared content.

---

## 22. Browser package layout

```text
package-manifest.json
checksums.sha256
README.txt

observation-set.json

context/
  runtime-context.json
  source-context-reference.json

coverage/
  runtime-coverage.json
  source-binding-coverage.json

observations/
  observation-0001/
    snapshot.json
    screenshot.png

diagnostics/
  diagnostics.json

validation/
  package-validation.json

schemas/
  ...
```

Optional artifacts are emitted only when real content exists.

---

## 23. Version boundary

```text
WordPress Plugin: 3.2.0
WordPress Bundle Schema: 2.0.0

Browser Extension: 1.5.0
Runtime Snapshot Schema: 1.2.0
Runtime Package Schema: 1.2.0

Shared Envelope Schema: 1.0.0
Bridge Context Schema: 1.0.0
Source Context Reference Schema: 1.0.0
Source Coverage Schema: 1.0.0
Runtime Coverage Schema: 1.0.0
Source Binding Coverage Schema: 1.0.0
Source Binding Evidence Schema: 1.0.0

EDIS-CJ-1
EDIS-URL-1
sha256
```

Python merged-correlation schemas are independently versioned.

---

## 24. Backward compatibility

Browser validation results:

```text
LEGACY_VALID_1_3
CURRENT_VALID_1_4
INVALID
```

Rules:

- Browser 1.3.0 packages remain readable.
- Missing 1.5.0 evidence remains absent.
- New evidence must not be fabricated as null-valued collected evidence.
- Deprecated fields are routed through explicit schema-version handling.
- Python owns historical ZIP ingestion and analytical migration.
- Browser may preserve/export legacy local records without inventing new facts.

---

## 25. WordPress 3.2.0 execution model

WordPress exports must not depend solely on WP-Cron.

Required routes:

```text
POST /export-jobs
POST /export-jobs/{id}/advance
POST /export-jobs/{id}/resume
POST /export-jobs/{id}/retry
POST /export-jobs/{id}/cancel
```

Each advancing request must use:

- job-specific lock
- owner and revision validation
- bounded time budget
- cursor persistence
- step-level commits
- heartbeat
- idempotency
- safe lock release

WP-Cron is a recovery mechanism, not the only executor.

Required job fields:

```text
executor_mode
revision
cursor
current_component
last_heartbeat
last_successful_step_at
attempt_count
last_error_code
last_error_at
next_retry_at
stale_after
schedule_state
schedule_error
```

---

## 26. Required common tests

The coordinated products must pass shared tests for:

### EDIS-CJ-1

- ordering
- Unicode
- Persian/RTL
- escaping
- numeric edge cases
- invalid numeric values
- UTF-8
- newline policy

### EDIS-URL-1

- default/non-default ports
- IDN
- percent encoding
- reserved characters
- repeated slashes
- dot segments
- path case
- trailing slash
- front page
- multisite
- multilingual paths
- reverse proxies
- plain permalinks
- previews
- fragments
- credentials
- query parameters
- token/nonce/email-like segments
- oversized segments

### Golden pairs

Each controlled fixture must produce:

```text
WordPress 3.2 source bundle
+
Browser 1.4 runtime bundle
+
Expected Python correlation assertions
```

Required fixture families:

- Elementor V3
- Atomic V4
- Hybrid
- Duplicate IDs
- Variables and Global Classes
- Responsive declarations
- Header/Footer/Popup
- Multilingual and multisite
- Large/deep DOM
- Addon-generated DOM

---

## 27. Final ownership summary

| Concern | Owner |
|---|---|
| Saved source values | WordPress |
| Source provenance | WordPress |
| Source truth | WordPress |
| Runtime DOM and geometry | Browser |
| Runtime availability | Browser |
| Preliminary source binding | Browser |
| Final correlation | Python |
| Effective values | Python |
| Rule readiness | Python |
| Formulas and rules | Python |
| Findings and scores | Python |
| Explanation and prioritization | LLM |

---

## 28. Implementation authorization

Implementation is authorized under this contract:

- Browser Runtime Collector 1.5.0 may proceed in the existing 1.3.0 repository.
- WordPress Evidence Exporter 3.2.0 may proceed in the existing 3.1.0 build platform.
- Python may implement schema routing, verification, final correlation, effective-value resolution, and rule readiness.

No product may claim coordinated compatibility until:

```text
PHP EDIS-CJ-1 output
=
JavaScript EDIS-CJ-1 output
=
Python EDIS-CJ-1 output
```

and:

```text
PHP EDIS-URL-1 output
=
JavaScript EDIS-URL-1 output
=
Python EDIS-URL-1 output
```

for the same shared golden vectors.

---

## 29. Required final deliverables

### Browser 1.5.0

1. Complete source repository
2. Chrome package
3. Edge package
4. Updated schemas
5. EDIS-CJ-1 vectors
6. EDIS-URL-1 vectors
7. Validation report
8. Privacy/security report
9. Backward-compatibility report
10. Deterministic-package report
11. Exact test commands/results
12. Unexecuted browser-test list
13. Final WordPress-required-fields contract
14. Final Python-ingestion contract

### WordPress 3.2.0

1. Complete build-platform source
2. Generated plugin source package
3. Installable WordPress ZIP
4. Bridge Context implementation
5. Source Coverage implementation
6. Element Structure Index
7. Source availability/truth model
8. Export worker recovery implementation
9. Comprehensive bilingual documentation
10. Shared vector test results
11. Deterministic build and package reports

### Python

1. Independent package verification
2. Schema-version routing
3. Source/runtime separation
4. Final correlation
5. Coverage-based readiness
6. Effective-value resolution
7. Shared-vector verification
8. Golden-pair assertions
9. Deterministic provenance
10. Versioned rule and formula execution

---

## 30. Contract status

```text
Architecture: FROZEN
Shared Envelope: FROZEN
State Dimensions: FROZEN
Bridge Context: FROZEN
Element Binding: FROZEN
Package Layouts: FROZEN
Version Boundaries: FROZEN

EDIS-CJ-1: CONDITIONALLY FROZEN pending shared vector conformance
EDIS-URL-1: CONDITIONALLY FROZEN pending shared vector conformance
```

This document is the authoritative coordination contract for the EDIS WordPress 3.2.0, Browser 1.5.0, and Python deterministic integration work.
