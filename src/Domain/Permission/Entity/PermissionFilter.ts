import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PagedModel } from "#src/Domain/Core/Entity/PagedModel.js";
import {
  type SortOrder,
  toSortOrder,
} from "#src/Domain/Core/Entity/SortOrder.js";

const PERMISSION_SORT_FIELDS = ["id", "name"] as const;
export type PermissionSortField = (typeof PERMISSION_SORT_FIELDS)[number];

/** The criteria of a permission search; every one is optional. */
export interface PermissionFilterFields {
  id?: Nullable<number>;
  /** Part of the permission name, or its exact id */
  name?: Nullable<string>;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: PermissionSortField;
  sortOrder?: SortOrder;
}

export class PermissionFilter extends PagedModel {
  public id?: Nullable<number>;
  /** Part of the permission name, or its exact id */
  public name?: Nullable<string>;
  public sortBy: PermissionSortField;
  public sortOrder: SortOrder;

  public constructor(fields: PermissionFilterFields = {}) {
    const {
      id,
      name,
      pageNumber,
      pageSize,
      sortBy = "name",
      sortOrder = "asc",
    } = fields;
    super(pageNumber, pageSize);
    this.id = id;
    this.name = name;
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
  }

  public static builder(): PermissionFilterBuilder {
    return new PermissionFilterBuilder();
  }

  public static build(builder: PermissionFilterBuilder): PermissionFilter {
    return new PermissionFilter({
      id: builder.id,
      name: builder.name,
      pageNumber: builder.pageNumber,
      pageSize: builder.pageSize,
      sortBy: builder.sortBy,
      sortOrder: builder.sortOrder,
    });
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

  public setName(name: Nullable<string>): PermissionFilterBuilder {
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
    this.sortOrder = toSortOrder(sortOrder);
    return this;
  }

  public build(): PermissionFilter {
    return PermissionFilter.build(this);
  }
}
