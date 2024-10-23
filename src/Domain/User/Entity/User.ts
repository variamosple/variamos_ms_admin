import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class User {
  id: Nullable<string>;
  user: string;
  name: string;
  email: string;
  isEnabled: boolean;
  isDeleted: boolean;
  createdAt: Date;
  lastLogin?: Date;
  roles?: string[];
  permissions?: string[];

  constructor(
    id: Nullable<string>,
    user: string,
    name: string,
    email: string,
    isEnabled: boolean,
    isDeleted: boolean,
    createdAt: Date,
    lastLogin?: Date,
    roles?: string[],
    permissions?: string[]
  ) {
    this.id = id;
    this.name = name;
    this.user = user;
    this.email = email;
    this.isEnabled = isEnabled;
    this.isDeleted = isDeleted;
    this.createdAt = createdAt;
    this.lastLogin = lastLogin;
    this.roles = roles;
    this.permissions = permissions;
  }

  public static builder(): UserBuilder {
    return new UserBuilder();
  }

  public static build(builder: UserBuilder): User {
    return new User(
      builder.getId(),
      builder.getUser(),
      builder.getName(),
      builder.getEmail(),
      builder.getIsEnabled(),
      builder.getIsDeleted(),
      builder.getCreatedAt(),
      builder.getLastLogin()
    );
  }
}

class UserBuilder {
  private id: Nullable<string>;
  private user!: string;
  private name!: string;
  private email!: string;
  private isEnabled!: boolean;
  private isDeleted!: boolean;
  private createdAt!: Date;
  private lastLogin?: Date;
  private roles?: string[];
  private permissions?: string[];

  public setId(id: Nullable<string>): this {
    this.id = id;
    return this;
  }

  public setUser(user: string): this {
    this.user = user;
    return this;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setEmail(email: string): this {
    this.email = email;
    return this;
  }

  public setIsEnabled(isEnabled: boolean): this {
    this.isEnabled = isEnabled;
    return this;
  }

  public setIsDeleted(isDeleted: boolean): this {
    this.isDeleted = isDeleted;
    return this;
  }

  public setCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  public setLastLogin(lastLogin?: Date): this {
    this.lastLogin = lastLogin;
    return this;
  }

  public setRoles(roles?: string[]): this {
    this.roles = roles;
    return this;
  }

  public setPermissions(permissions?: string[]): this {
    this.permissions = permissions;
    return this;
  }

  public getId(): Nullable<string> {
    return this.id;
  }

  public getUser(): string {
    return this.user;
  }

  public getName(): string {
    return this.name;
  }

  public getEmail(): string {
    return this.email;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public getIsDeleted(): boolean {
    return this.isDeleted;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getLastLogin(): Date | undefined {
    return this.lastLogin;
  }

  public getRoles(): string[] | undefined {
    return this.roles;
  }

  public getPermissions(): string[] | undefined {
    return this.permissions;
  }

  public build(): User {
    return User.build(this);
  }
}
