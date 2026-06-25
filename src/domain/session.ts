import type { BindingState } from "./model";

export interface BindingSummaryEvidence {
  readonly normalizedOriginMatches: boolean;
  readonly documentIdMatches: boolean;
  readonly elementorIdsOverlap: number;
  readonly userConfirmed: boolean;
  readonly conflictingEvidence?: boolean;
}

/**
 * Produces a session-level summary of preliminary browser binding evidence.
 * User confirmation is provenance only and never upgrades ambiguous evidence.
 */
export function determineSourceBindingState(evidence: BindingSummaryEvidence): BindingState {
  if (evidence.conflictingEvidence) return "AMBIGUOUS";
  if (
    evidence.normalizedOriginMatches &&
    evidence.documentIdMatches &&
    evidence.elementorIdsOverlap > 0
  )
    return "EXACT";
  if (
    evidence.normalizedOriginMatches &&
    (evidence.documentIdMatches || evidence.elementorIdsOverlap > 0)
  )
    return "PROBABLE";
  return "UNMATCHED";
}
