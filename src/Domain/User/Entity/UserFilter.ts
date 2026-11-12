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

/** The criteria of an account search; every one is optional. */
export interface UserFilterFields {
  id?: Nullable<string>;
  user?: Nullable<string>;
  name?: Nullable<string>;
  email?: Nullable<string>;
  search?: Nullable<string>;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: UserSortField;
  sortOrder?: SortOrder;
}

export class UserFilter extends PagedModel {
  public id?: Nullable<string>;
  public user?: Nullable<string>;
  public name?: Nullable<string>;
  public email?: Nullable<string>;
  public search?: Nullable<string>;
  public sortBy: UserSortField;
  public sortOrder: SortOrder;

  public constructor(fields: UserFilterFields = {}) {
    const {
      id,
      user,
      name,
      email,
      search,
      pageNumber,
      pageSize,
      sortBy = "name",
      sortOrder = "asc",
    } = fields;
    super(pageNumber, pageSize);
    this.id = id;
    this.user = user;
    this.name = name;
    this.email = email;
    this.search = search;
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
  }

  public static builder(): UserFilterBuilder {
    return new UserFilterBuilder();
  }

  public static build(builder: UserFilterBuilder): UserFilter {
    return new UserFilter({
      id: builder.id,
      user: builder.user,
      name: builder.name,
      email: builder.email,
      search: builder.search,
      pageNumber: builder.pageNumber,
      pageSize: builder.pageSize,
      sortBy: builder.sortBy,
      sortOrder: builder.sortOrder,
    });
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

  public setName(name: Nullable<string>): UserFilterBuilder {
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

  public setSearch(search: Nullable<string>): UserFilterBuilder {
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
