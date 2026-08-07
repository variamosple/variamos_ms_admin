import type { Nullable } from "@src/Domain/Core/Entity/Nullable.js";

export class UserRole {
  public userId: Nullable<string>;
  public roleId: Nullable<number>;

  public constructor(userId: Nullable<string>, roleId: Nullable<number>) {
    this.userId = userId;
    this.roleId = roleId;
  }
}
