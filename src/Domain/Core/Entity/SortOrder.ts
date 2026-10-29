export type SortOrder = "asc" | "desc";

/** "desc" sorts descending; anything else, ascending */
export const toSortOrder = (value: unknown): SortOrder =>
  value === "desc" ? "desc" : "asc";
