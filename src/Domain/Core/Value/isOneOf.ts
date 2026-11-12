/**
 * Whether a text is one of the values of a closed list, telling the
 * compiler so: `includes` on a list of literals refuses a plain string.
 */
export const isOneOf = <T extends string>(
  allowed: readonly T[],
  value: string,
): value is T => allowed.some((item) => item === value);
