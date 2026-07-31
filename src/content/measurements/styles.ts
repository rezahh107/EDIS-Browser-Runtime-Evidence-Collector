import { styleAllowlist } from "../../domain/styleAllowlist";
import { MAX_COMPUTED_STYLE_VALUE_LENGTH } from "../../domain/styleValue";
import { computedStyleFor, type CaptureMeasurementContext } from "./context";

export function collectComputedStyles(
  element: Element,
  includeColors: boolean,
  context?: CaptureMeasurementContext,
): Readonly<Record<string, string>> {
  const style = computedStyleFor(element, context);
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const property of styleAllowlist(includeColors)) {
    const value = style.getPropertyValue(property).trim();
    if (value.length <= MAX_COMPUTED_STYLE_VALUE_LENGTH) values[property] = value;
    else context?.styleValueOmissions.push({ property });
  }
  return values;
}
