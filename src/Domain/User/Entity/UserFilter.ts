import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PagedModel } from "#src/Domain/Core/Entity/PagedModel.js";
import {
  type SortOrder,
  toSortOrder,
} from "#src/Domain/Core/Entity/SortOrder.js";

const USER_SORT_FIELDS = [
  "user",
  "name",
  "email",
  "createdAt",
  "lastLogin",
] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export class UserFilter extends PagedModel {
  public constructor(
    public id?: Nullable<string>,
    public user?: Nullable<string>,
    public name?: Nullable<string>,
    public email?: Nullable<string>,
    public search?: Nullable<string>,
    pageNumber?: number,
    pageSize?: number,
    public sortBy: UserSortField = "name",
    public sortOrder: SortOrder = "asc",
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): UserFilterBuilder {
    return new UserFilterBuilder();
  }

  public static build(builder: UserFilterBuilder): UserFilter {
    return new UserFilter(
      builder.id,
      builder.user,
      builder.name,
      builder.email,
      builder.search,
      builder.pageNumber,
      builder.pageSize,
      builder.sortBy,
      builder.sortOrder,
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
  public sortBy?: UserSortField;
  public sortOrder?: SortOrder;

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

  /** Sorts by one of the list columns; anything else: by name */
  public setSort(sortBy: unknown, sortOrder: unknown): UserFilterBuilder {
    this.sortBy = USER_SORT_FIELDS.find((field) => field === sortBy);
    this.sortOrder = toSortOrder(sortOrder);
    return this;
  }

  public build(): UserFilter {
    return UserFilter.build(this);
  }
}
