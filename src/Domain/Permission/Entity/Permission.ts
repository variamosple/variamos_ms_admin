import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { PermissionName } from "./PermissionName.js";

export class Permission {
  public readonly id: Nullable<number>;
  public readonly name: string;

  public constructor(id: Nullable<number>, name: string) {
    this.id = id;
    this.name = new PermissionName(name).getValue();
  }

  public static builder(): PermissionBuilder {
    return new PermissionBuilder();
  }
}

export class PermissionBuilder {
  private id: Nullable<number> = null;
  private name!: string;

  public setId(id: Nullable<number>): this {
    this.id = id;
    return this;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public build(): Permission {
    return new Permission(this.id, this.name);
  }
}
