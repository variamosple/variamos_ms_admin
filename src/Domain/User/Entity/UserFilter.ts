import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { PagedModel } from "@src/Domain/Core/Entity/PagedModel";

export class UserFilter extends PagedModel {
  constructor(
    public id?: Nullable<string>,
    public user?: Nullable<string>,
    public name?: Nullable<string>,
    public email?: Nullable<string>,
    public search?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): UserFilterBuilder {
    return new UserFilterBuilder();
  }

  public static build(builder: UserFilterBuilder): UserFilter {
    return new UserFilter(
      builder.id,
      builder.name,
      builder.user,
      builder.email,
      builder.search,
      builder.pageNumber,
      builder.pageSize
    );
  }
}

class UserFilterBuilder {
  public id: Nullable<string>;
  public user: Nullable<string>;
  public name: Nullable<string>;
  public email: Nullable<string>;
  public search: Nullable<string>;
  public pageNumber?: number;
  public pageSize?: number;

  public setId(id: string): UserFilterBuilder {
    this.id = id;
    return this;
  }

  public setName(name: string): UserFilterBuilder {
    this.name = name;
    return this;
  }

  public setUser(user: string): UserFilterBuilder {
    this.user = user;
    return this;
  }

  public setEmail(email: string): UserFilterBuilder {
    this.email = email;
    return this;
  }

  public setSearch(search: string): UserFilterBuilder {
    this.search = search;
    return this;
  }

  public setPageNumber(pageNumber: number): UserFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): UserFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  public build(): UserFilter {
    return UserFilter.build(this);
  }
}
