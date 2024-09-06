import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class RoleFilter extends PagedModel {
  constructor(
    public id?: Nullable<number>,
    public name?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number
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
      builder.pageSize
    );
  }
}

class RoleFilterBuilder {
  public id: Nullable<number>;
  public name: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;

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

  public build(): RoleFilter {
    return RoleFilter.build(this);
  }
}
