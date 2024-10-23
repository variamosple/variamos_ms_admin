import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class UserRoleFilter extends PagedModel {
  constructor(public userId: string, pageNumber?: number, pageSize?: number) {
    super(pageNumber, pageSize);
  }

  public static builder(): UserRoleFilterBuilder {
    return new UserRoleFilterBuilder();
  }

  public static build(builder: UserRoleFilterBuilder): UserRoleFilter {
    return new UserRoleFilter(
      builder.userId,
      builder.pageNumber,
      builder.pageSize
    );
  }
}

class UserRoleFilterBuilder {
  public userId!: string;
  public pageNumber?: number;
  public pageSize?: number;

  public setUserId(id: string): UserRoleFilterBuilder {
    this.userId = id;
    return this;
  }

  public setPageNumber(pageNumber: number): UserRoleFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): UserRoleFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  public build(): UserRoleFilter {
    return UserRoleFilter.build(this);
  }
}
