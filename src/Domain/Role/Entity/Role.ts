import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import type { Permission } from "#src/Domain/Permission/Entity/Permission.js";

export class Role {
  public readonly id: Nullable<number>;
  public readonly name: string;
  public readonly permissions?: Permission[];

  // "Test role": a capital on the first word only, words split by one space
  private static readonly ROLE_NAME_REGEX = /^[A-Z][a-z]*(?:\s[a-z]+)*$/;

  public constructor(
    id: Nullable<number>,
    name: string,
    permissions?: Permission[],
  ) {
    if (!name || !Role.ROLE_NAME_REGEX.test(name)) {
      throw new Error(
        "Role name must start with an uppercase letter, followed by lowercase words separated by single spaces (e.g. 'Test role').",
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
