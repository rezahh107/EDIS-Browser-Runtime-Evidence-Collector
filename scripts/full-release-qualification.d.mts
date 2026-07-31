export interface FullReleaseQualificationResult {
  readonly schema_version: "1.0.0";
  readonly project_version: string | null;
  readonly gate_mode: string | null;
  readonly gate_qualification_scope: string | null;
  readonly browser_qualification_status: string | null;
  readonly exact_chrome_qualified: boolean;
  readonly exact_edge_qualified: boolean;
  readonly required_target_test_executions: number | null;
  readonly observed_target_test_executions: number;
  readonly failed_tests: number | null;
  readonly skipped_tests: number | null;
  readonly flaky_tests: number | null;
  readonly full_release_gate_passed: boolean;
  readonly failure_reasons: readonly string[];
}

export function evaluateFullReleaseQualification(
  gate: unknown,
  qualification: unknown,
): FullReleaseQualificationResult;

export function writeFullReleaseQualification(
  result: FullReleaseQualificationResult,
  outputPath: string,
): Promise<void>;
