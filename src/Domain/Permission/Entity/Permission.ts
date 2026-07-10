import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Permission {
  public readonly id: Nullable<number>;
  public readonly name: string;

  private static readonly PERMISSION_NAME_REGEX = /^[a-z0-9-]+::[a-z0-9-]+$/;

  public constructor(id: Nullable<number>, name: string) {
    if (!name || !Permission.PERMISSION_NAME_REGEX.test(name)) {
      throw new Error(
        "Permission name must follow the 'resource::action' format (e.g. 'resource::action').",
      );
    }
    this.id = id;
    this.name = name.trim();
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
