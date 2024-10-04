import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class RolePermissionFilter extends PagedModel {
  constructor(public roleId: number, pageNumber?: number, pageSize?: number) {
    super(pageNumber, pageSize);
  }

  public static builder(): RolePermissionFilterBuilder {
    return new RolePermissionFilterBuilder();
  }

  public static build(
    builder: RolePermissionFilterBuilder
  ): RolePermissionFilter {
    return new RolePermissionFilter(
      builder.roleId,
      builder.pageNumber,
      builder.pageSize
    );
  }
}

class RolePermissionFilterBuilder {
  public roleId!: number;
  public pageNumber?: number;
  public pageSize?: number;

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

  public build(): RolePermissionFilter {
    return RolePermissionFilter.build(this);
  }
}
