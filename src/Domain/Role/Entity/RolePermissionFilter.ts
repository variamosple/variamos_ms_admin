import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PagedModel } from "#src/Domain/Core/Entity/PagedModel.js";

export class RolePermissionFilter extends PagedModel {
  public constructor(
    public roleId: number,
    pageNumber?: number,
    pageSize?: number,
    /** Part of the permission name, or its exact id */
    public search?: Nullable<string>,
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): RolePermissionFilterBuilder {
    return new RolePermissionFilterBuilder();
  }

  public static build(
    builder: RolePermissionFilterBuilder,
  ): RolePermissionFilter {
    return new RolePermissionFilter(
      builder.roleId,
      builder.pageNumber,
      builder.pageSize,
      builder.search,
    );
  }
}

class RolePermissionFilterBuilder {
  public roleId!: number;
  public pageNumber?: number;
  public pageSize?: number;
  public search?: Nullable<string>;

  public setRoleId(id: number): RolePermissionFilterBuilder {
    this.roleId = id;
    return this;
  }

  public setPageNumber(pageNumber: number): RolePermissionFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): RolePermissionFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  public setSearch(search: Nullable<string>): RolePermissionFilterBuilder {
    this.search = search;
    return this;
  }

  public build(): RolePermissionFilter {
    return RolePermissionFilter.build(this);
  }
}
