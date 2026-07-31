import type { Diagnostic } from "./diagnostics";

export function deriveSemanticCompleteness(diagnostics: readonly Diagnostic[]): {
  readonly status: "COMPLETE" | "PARTIAL";
  readonly artifactStatus: "AVAILABLE" | "PARTIAL";
  readonly reasons: readonly string[];
} {
  const reasons = [
    ...new Set(diagnostics.filter((item) => item.scope === "SEMANTIC").map((item) => item.code)),
  ].sort();
  return {
    status: reasons.length === 0 ? "COMPLETE" : "PARTIAL",
    artifactStatus: reasons.length === 0 ? "AVAILABLE" : "PARTIAL",
    reasons,
  };
}
