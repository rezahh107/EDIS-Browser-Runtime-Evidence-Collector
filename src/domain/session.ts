import type { MatchStatus } from "./model";

export interface MatchEvidence {
  readonly normalizedOriginMatches: boolean;
  readonly documentIdMatches: boolean;
  readonly elementorIdsOverlap: number;
  readonly userConfirmed: boolean;
}

export function determineMatchStatus(evidence: MatchEvidence): MatchStatus {
  if (evidence.userConfirmed) return "USER_CONFIRMED";
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
