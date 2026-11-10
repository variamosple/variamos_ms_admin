import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PagedModel } from "#src/Domain/Core/Entity/PagedModel.js";
import {
  type SortOrder,
  toSortOrder,
} from "#src/Domain/Core/Entity/SortOrder.js";

const ROLE_SORT_FIELDS = ["id", "name"] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

export class RoleFilter extends PagedModel {
  public constructor(
    public id?: Nullable<number>,
    public name?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number,
    public sortBy: RoleSortField = "name",
    public sortOrder: SortOrder = "asc",
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): RoleFilterBuilder {
    return new RoleFilterBuilder();
  }

  public static build(builder: RoleFilterBuilder): RoleFilter {
    return new RoleFilter(
      builder.id,
      builder.name,
      builder.pageNumber,
      builder.pageSize,
      builder.sortBy,
      builder.sortOrder,
    );
  }
}

class RoleFilterBuilder {
  public id: Nullable<number>;
  public name: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;
  public sortBy?: RoleSortField;
  public sortOrder?: SortOrder;

  public setId(id: number): RoleFilterBuilder {
    this.id = id;
    return this;
  }

  public setName(name: string): RoleFilterBuilder {
    this.name = name;
    return this;
  }

  public setPageNumber(pageNumber: number): RoleFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): RoleFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  /** Sorts by id or name, ascending or descending; anything else: by name */
  public setSort(sortBy: unknown, sortOrder: unknown): RoleFilterBuilder {
    this.sortBy = ROLE_SORT_FIELDS.find((field) => field === sortBy);
    this.sortOrder = toSortOrder(sortOrder);
    return this;
  }

  public build(): RoleFilter {
    return RoleFilter.build(this);
  }
}
