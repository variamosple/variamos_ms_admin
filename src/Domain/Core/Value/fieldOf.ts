/**
 * A field of a value whose shape nobody checked, undefined when the value is
 * not an object or lacks the field. The caller checks the type it needs;
 * Biome reads the result as any, so the caller declares it unknown.
 */
export const fieldOf = (value: unknown, field: string): unknown =>
  typeof value === "object" && value !== null
    ? Reflect.get(value, field)
    : undefined;
