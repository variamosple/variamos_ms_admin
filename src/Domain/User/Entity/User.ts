import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class User {
  id: Nullable<string>;
  user: string;
  name: string;
  email: string;
  isEnabled: boolean;
  createdAt: Date;
  lastLogin?: Date;

  constructor(
    id: Nullable<string>,
    user: string,
    name: string,
    email: string,
    isEnabled: boolean,
    createdAt: Date,
    lastLogin?: Date
  ) {
    this.id = id;
    this.name = name;
    this.user = user;
    this.email = email;
    this.isEnabled = isEnabled;
    this.createdAt = createdAt;
    this.lastLogin = lastLogin;
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
  private createdAt!: Date;
  private lastLogin?: Date;

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

  public setCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  public setLastLogin(lastLogin?: Date): this {
    this.lastLogin = lastLogin;
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

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getLastLogin(): Date | undefined {
    return this.lastLogin;
  }

  public build(): User {
    return User.build(this);
  }
}
