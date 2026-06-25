import { canonicalJsonWithoutFinalNewline } from "./canonical";
import type { BindingContext, HashDigest, UrlLocatorFacts } from "./model";
import { stableIdCandidate } from "./redaction";
import { normalizeUrlLocator, pageLocatorDigest } from "./urlNormalization";
import { sha256Digest } from "../infrastructure/checksum";

export interface PageFingerprintEvidence {
  readonly locator_facts: UrlLocatorFacts;
  readonly page_locator_sha256: HashDigest;
  readonly raw_data_elementor_ids: readonly string[];
  readonly page_fingerprint: HashDigest;
}

export async function computePageFingerprintEvidence(input: {
  readonly rawUrl: string;
  readonly pageMarkerPresent: boolean;
  readonly rawDataElementorIds: readonly string[];
  readonly bindingContext: BindingContext | null;
}): Promise<PageFingerprintEvidence> {
  const locator = normalizeUrlLocator(input.rawUrl, input.bindingContext?.site_path_scope ?? "/");
  const locatorHash = await pageLocatorDigest(locator.facts);
  const rawPageIds = normalizePageElementorIds(input.rawDataElementorIds);
  const pageFingerprint = await sha256Digest(
    canonicalJsonWithoutFinalNewline({
      locator: locator.facts,
      page_marker_present: input.pageMarkerPresent,
      raw_data_elementor_ids: rawPageIds,
      selected_document_fingerprint:
        input.bindingContext?.selected_document?.document_fingerprint ?? null,
    }),
  );
  return {
    locator_facts: locator.facts,
    page_locator_sha256: locatorHash,
    raw_data_elementor_ids: rawPageIds,
    page_fingerprint: pageFingerprint,
  };
}

export function normalizePageElementorIds(values: readonly string[]): readonly string[] {
  return [
    ...new Set(
      values
        .map((value) => stableIdCandidate(value))
        .filter((value): value is string => value !== null),
    ),
  ]
    .sort()
    .slice(0, 100);
}
