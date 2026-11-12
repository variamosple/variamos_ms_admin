/**
 * A query, header or cookie value read as text. Express types them loosely:
 * a repeated parameter gives an array, `a[b]=c` an object. Only a string is
 * kept; anything else counts as absent.
 */
export const queryText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
