import { Nullable } from "./Nullable";

export class PagedModel {
  constructor(
    public pageNumber: Nullable<number> = 1,
    public pageSize: Nullable<number> = 20
  ) {}
}
