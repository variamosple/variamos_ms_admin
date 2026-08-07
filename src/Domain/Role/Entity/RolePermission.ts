import type { Nullable } from "@src/Domain/Core/Entity/Nullable.js";

export class RolePermission {
  public roleId: Nullable<number>;
  public permissionId: Nullable<number>;

  public constructor(id: Nullable<number>, permissionId: Nullable<number>) {
    this.roleId = id;
    this.permissionId = permissionId;
  }
}
