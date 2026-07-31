import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function evaluateFullReleaseQualification(gate, qualification) {
  const reasons = [];
  if (gate?.exitCode !== 0) reasons.push("GATE_EXIT_CODE_NOT_ZERO");
  if (gate?.mode !== "FULL_TWO_TARGET") reasons.push("FULL_TWO_TARGET_REQUIRED");
  if (gate?.browser?.qualificationScope !== "FULL_TWO_TARGET_RELEASE_GATE")
    reasons.push("FULL_TWO_TARGET_SCOPE_REQUIRED");
  if (qualification?.status !== "PASS") reasons.push("BROWSER_QUALIFICATION_NOT_PASS");
  if (qualification?.exact_chrome_qualified !== true) reasons.push("EXACT_CHROME_REQUIRED");
  if (qualification?.exact_edge_qualified !== true) reasons.push("EXACT_EDGE_REQUIRED");

  const requiredTargets = ["chrome", "edge"];
  const expectedPerTarget = qualification?.contract_tests_per_target;
  const requiredExecutions = qualification?.required_target_test_executions;
  if (!Number.isInteger(expectedPerTarget) || expectedPerTarget < 1)
    reasons.push("INVALID_REQUIRED_TEST_CONTRACT");
  if (
    !Number.isInteger(requiredExecutions) ||
    requiredExecutions !== expectedPerTarget * requiredTargets.length
  )
    reasons.push("INVALID_TARGET_TEST_EXECUTION_COUNT");

  let observedExecutions = 0;
  for (const target of requiredTargets) {
    const result = qualification?.target_results?.[target];
    if (result?.status !== "PASS" || result?.exact_qualified !== true)
      reasons.push(`${target.toUpperCase()}_TARGET_NOT_EXACT_PASS`);
    if (result?.tests !== expectedPerTarget || result?.passed !== expectedPerTarget)
      reasons.push(`${target.toUpperCase()}_TEST_COUNT_INCOMPLETE`);
    if ((result?.missing_tests?.length ?? 0) !== 0) reasons.push(`${target.toUpperCase()}_MISSING_TESTS`);
    if ((result?.duplicate_tests?.length ?? 0) !== 0)
      reasons.push(`${target.toUpperCase()}_DUPLICATE_TESTS`);
    if ((result?.unexpected_tests?.length ?? 0) !== 0)
      reasons.push(`${target.toUpperCase()}_UNEXPECTED_TESTS`);
    const evidence = Array.isArray(result?.test_evidence) ? result.test_evidence : [];
    if (evidence.length !== expectedPerTarget)
      reasons.push(`${target.toUpperCase()}_TEST_EVIDENCE_INCOMPLETE`);
    observedExecutions += evidence.length;
  }

  if (qualification?.failed !== 0) reasons.push("FAILED_BROWSER_TESTS_PRESENT");
  if (qualification?.skipped !== 0) reasons.push("SKIPPED_BROWSER_TESTS_PRESENT");
  if (qualification?.flaky !== 0) reasons.push("FLAKY_BROWSER_TESTS_PRESENT");
  if (qualification?.passed !== requiredExecutions) reasons.push("PASSED_TEST_COUNT_INCOMPLETE");
  if (observedExecutions !== requiredExecutions) reasons.push("TEST_EVIDENCE_COUNT_INCOMPLETE");

  const uniqueReasons = [...new Set(reasons)].sort();
  return {
    schema_version: "1.0.0",
    project_version: gate?.projectVersion ?? qualification?.extension_version ?? null,
    gate_mode: gate?.mode ?? null,
    gate_qualification_scope: gate?.browser?.qualificationScope ?? null,
    browser_qualification_status: qualification?.status ?? null,
    exact_chrome_qualified: qualification?.exact_chrome_qualified === true,
    exact_edge_qualified: qualification?.exact_edge_qualified === true,
    required_target_test_executions: requiredExecutions ?? null,
    observed_target_test_executions: observedExecutions,
    failed_tests: qualification?.failed ?? null,
    skipped_tests: qualification?.skipped ?? null,
    flaky_tests: qualification?.flaky ?? null,
    full_release_gate_passed: uniqueReasons.length === 0,
    failure_reasons: uniqueReasons,
  };
}

export async function writeFullReleaseQualification(result, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}
