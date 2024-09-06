import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class PermissionFilter extends PagedModel {
  constructor(
    public id?: Nullable<number>,
    public name?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number
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
      builder.pageSize
    );
  }
}

class PermissionFilterBuilder {
  public id: Nullable<number>;
  public name: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;

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

  public build(): PermissionFilter {
    return PermissionFilter.build(this);
  }
}
