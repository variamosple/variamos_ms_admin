import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class UserRole {
  userId: Nullable<string>;
  roleId: Nullable<number>;

  constructor(userId: Nullable<string>, roleId: Nullable<number>) {
    this.userId = userId;
    this.roleId = roleId;
  }
}
