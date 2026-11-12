import { fieldOf } from "#src/Domain/Core/Value/fieldOf.js";

/**
 * The number of rows a write query changed, as the PostgreSQL driver gives
 * it in the second element of the query result; 0 when it is not there.
 */
export const rowCountOf = (result: unknown): number => {
  const count: unknown = fieldOf(result, "rowCount");
  return typeof count === "number" ? count : 0;
};
