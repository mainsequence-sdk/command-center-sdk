/** Joins class names, skipping the ones a condition turned off. */
export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
