import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { Permission } from "@src/Domain/Permission/Entity/Permission";

export class Role {
  id: Nullable<number>;
  name: string;
  permissions?: Permission[];

  constructor(id: Nullable<number>, name: string, permissions?: Permission[]) {
    this.id = id;
    this.name = name;
    this.permissions = permissions;
  }
}
