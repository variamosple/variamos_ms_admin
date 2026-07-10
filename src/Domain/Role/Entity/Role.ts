import { Nullable } from "@src/Domain/Core/Entity/Nullable";
import { Permission } from "@src/Domain/Permission/Entity/Permission";

export class Role {
  public readonly id: Nullable<number>;
  public readonly name: string;
  public readonly permissions?: Permission[];

  private static readonly ROLE_NAME_REGEX = /^[A-Z][a-z]*(?:\s[a-z]+)*$/;

  public constructor(id: Nullable<number>, name: string, permissions?: Permission[]) {
    if (!name || !Role.ROLE_NAME_REGEX.test(name)) {
      throw new Error(
        "Role name must start with an uppercase letter, and subsequent words must be lowercase.",
      );
    }
    this.id = id;
    this.name = name.trim();
    this.permissions = permissions;
  }

  public static builder(): RoleBuilder {
    return new RoleBuilder();
  }
}

export class RoleBuilder {
  private id: Nullable<number> = null;
  private name!: string;
  private permissions?: Permission[];

  public setId(id: Nullable<number>): this {
    this.id = id;
    return this;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setPermissions(permissions?: Permission[]): this {
    this.permissions = permissions;
    return this;
  }

  public build(): Role {
    return new Role(this.id, this.name, this.permissions);
  }
}
