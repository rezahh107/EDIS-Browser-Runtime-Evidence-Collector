export type WordPressAdminBarDetectionState = "ABSENT" | "PRESENT" | "AMBIGUOUS";

export interface WordPressAdminBarSignals {
  readonly bodyAdminBarClass: boolean;
  readonly wpadminbarElementPresent: boolean;
  readonly wpadminbarVisible: boolean;
  readonly geometryAffected: boolean;
}

export function classifyWordPressAdminBar(
  signals: WordPressAdminBarSignals,
): WordPressAdminBarDetectionState {
  if (signals.wpadminbarVisible) return "PRESENT";
  if (signals.bodyAdminBarClass || signals.wpadminbarElementPresent) return "AMBIGUOUS";
  return "ABSENT";
}
