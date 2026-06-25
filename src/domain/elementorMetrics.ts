import type { DiagnosticCode } from "./diagnostics";

export const ELEMENTOR_METRIC_INVARIANT_CODE: DiagnosticCode =
  "EDIS_RUNTIME_ELEMENTOR_METRIC_INVARIANT_VIOLATION";

export interface ElementorMetricCounts {
  readonly discovered_elementor_elements: number;
  readonly emitted_elementor_elements: number;
  readonly skipped_elementor_elements: number;
}

export function computeSkippedElementorElements(discovered: number, emitted: number): number {
  assertNonNegativeInteger(discovered, "discovered_elementor_elements");
  assertNonNegativeInteger(emitted, "emitted_elementor_elements");
  if (emitted > discovered) {
    throw new Error(
      `${ELEMENTOR_METRIC_INVARIANT_CODE}: emitted Elementor elements (${String(emitted)}) exceed discovered Elementor elements (${String(discovered)}).`,
    );
  }
  return discovered - emitted;
}

export function assertElementorMetricInvariant(metrics: ElementorMetricCounts): void {
  const expectedSkipped = computeSkippedElementorElements(
    metrics.discovered_elementor_elements,
    metrics.emitted_elementor_elements,
  );
  assertNonNegativeInteger(metrics.skipped_elementor_elements, "skipped_elementor_elements");
  if (metrics.skipped_elementor_elements !== expectedSkipped) {
    throw new Error(
      `${ELEMENTOR_METRIC_INVARIANT_CODE}: discovered Elementor elements must equal emitted plus skipped Elementor elements.`,
    );
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${ELEMENTOR_METRIC_INVARIANT_CODE}: ${field} must be a non-negative safe integer.`,
    );
  }
}
