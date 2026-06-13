import { styleAllowlist } from "../../domain/styleAllowlist";

export function collectComputedStyles(
  element: Element,
  includeColors: boolean,
): Readonly<Record<string, string>> {
  const style = getComputedStyle(element);
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const property of styleAllowlist(includeColors))
    values[property] = style.getPropertyValue(property);
  return values;
}
