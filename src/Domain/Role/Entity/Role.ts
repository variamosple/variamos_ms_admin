import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Role {
  id: Nullable<number>;
  name: string;
  permissions?: Role[];

  constructor(id: Nullable<number>, name: string, permissions?: Role[]) {
    this.id = id;
    this.name = name;
    this.permissions = permissions;
  }
}
