import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Email } from "./Email.js";

/** What an account is made of. */
export interface UserFields {
  id: Nullable<string>;
  user: string;
  name: string;
  email: string;
  countryCode: Nullable<string>;
  countryName: Nullable<string>;
  isEnabled: boolean;
  isDeleted: boolean;
  createdAt: Date;
  lastLogin?: Date;
  roles?: string[];
  permissions?: string[];
}

export class User {
  public id: Nullable<string>;
  public user: string;
  public name: string;
  public email: string;
  public countryCode: Nullable<string>;
  public countryName: Nullable<string>;
  public isEnabled: boolean;
  public isDeleted: boolean;
  public createdAt: Date;
  public lastLogin?: Date;
  public roles?: string[];
  public permissions?: string[];

  public constructor(fields: UserFields) {
    const {
      id,
      user,
      name,
      email,
      countryCode,
      countryName,
      isEnabled,
      isDeleted,
      createdAt,
      lastLogin,
      roles,
      permissions,
    } = fields;
    if (name !== undefined && name !== null && name.trim() === "") {
      throw new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "Name is required.",
      );
    }
    const validatedEmail = email ? new Email(email).getValue() : email;

    this.id = id;
    this.name = name;
    this.user = user;
    this.email = validatedEmail;
    this.countryCode = countryCode;
    this.countryName = countryName;
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
    return new User({
      id: builder.getId(),
      user: builder.getUser(),
      name: builder.getName(),
      email: builder.getEmail(),
      countryCode: builder.getCountryCode(),
      countryName: builder.getCountryName(),
      isEnabled: builder.getIsEnabled(),
      isDeleted: builder.getIsDeleted(),
      createdAt: builder.getCreatedAt(),
      lastLogin: builder.getLastLogin(),
      roles: builder.getRoles(),
      permissions: builder.getPermissions(),
    });
  }
}

class UserBuilder {
  private id: Nullable<string>;
  private user!: string;
  private name!: string;
  private email!: string;
  private countryCode: Nullable<string>;
  private countryName: Nullable<string>;
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

  public setCountryCode(countryCode: Nullable<string>): this {
    this.countryCode = countryCode;
    return this;
  }

  public setCountryName(countryName: Nullable<string>): this {
    this.countryName = countryName;
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

  public getCountryCode(): Nullable<string> {
    return this.countryCode;
  }

  public getCountryName(): Nullable<string> {
    return this.countryName;
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
    return new User({
      id: this.id,
      user: this.user,
      name: this.name,
      email: this.email,
      countryCode: this.countryCode,
      countryName: this.countryName,
      isEnabled: this.isEnabled,
      isDeleted: this.isDeleted,
      createdAt: this.createdAt,
      lastLogin: this.lastLogin,
      roles: this.roles,
      permissions: this.permissions,
    });
  }
}
