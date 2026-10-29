import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PagedModel } from "#src/Domain/Core/Entity/PagedModel.js";

const PERMISSION_SORT_FIELDS = ["id", "name"] as const;
export type PermissionSortField = (typeof PERMISSION_SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

export class PermissionFilter extends PagedModel {
  public constructor(
    public id?: Nullable<number>,
    /** Part of the permission name, or its exact id */
    public name?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number,
    public sortBy: PermissionSortField = "name",
    public sortOrder: SortOrder = "asc",
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): PermissionFilterBuilder {
    return new PermissionFilterBuilder();
  }

  public static build(builder: PermissionFilterBuilder): PermissionFilter {
    return new PermissionFilter(
      builder.id,
      builder.name,
      builder.pageNumber,
      builder.pageSize,
      builder.sortBy,
      builder.sortOrder,
    );
  }
}

class PermissionFilterBuilder {
  public id: Nullable<number>;
  public name: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;
  public sortBy?: PermissionSortField;
  public sortOrder?: SortOrder;

  public setId(id: number): PermissionFilterBuilder {
    this.id = id;
    return this;
  }

  public setName(name: string): PermissionFilterBuilder {
    this.name = name;
    return this;
  }

  public setPageNumber(pageNumber: number): PermissionFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): PermissionFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  /** Sorts by id or name, ascending or descending; anything else: by name */
  public setSort(sortBy: unknown, sortOrder: unknown): PermissionFilterBuilder {
    this.sortBy = PERMISSION_SORT_FIELDS.find((field) => field === sortBy);
    this.sortOrder = sortOrder === "desc" ? "desc" : "asc";
    return this;
  }

  public build(): PermissionFilter {
    return PermissionFilter.build(this);
  }
}
