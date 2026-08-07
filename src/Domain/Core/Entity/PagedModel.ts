import type { Nullable } from "./Nullable.js";

export class PagedModel {
  public constructor(
    public pageNumber: Nullable<number> = 1,
    public pageSize: Nullable<number> = 20,
  ) {}
}
