import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class RolePermission {
  roleId: Nullable<number>;
  permissionId: Nullable<number>;

  constructor(id: Nullable<number>, permissionId: Nullable<number>) {
    this.roleId = id;
    this.permissionId = permissionId;
  }
}
