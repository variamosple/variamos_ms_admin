export class PasswordUpdate {
  private readonly id: string;
  private readonly currentPassword: string;
  private readonly newPassword: string;
  private readonly passwordConfirmation: string;

  public constructor(
    id: string,
    currentPassword: string,
    newPassword: string,
    passwordConfirmation: string,
  ) {
    this.id = id;
    this.currentPassword = currentPassword;
    this.newPassword = newPassword;
    this.passwordConfirmation = passwordConfirmation;
  }

  public static builder(): PasswordUpdateBuilder {
    return new PasswordUpdateBuilder();
  }

  public static build(builder: PasswordUpdateBuilder): PasswordUpdate {
    return new PasswordUpdate(
      builder.getId(),
      builder.getCurrentPassword(),
      builder.getNewPassword(),
      builder.getPasswordConfirmation(),
    );
  }

  public getId(): string {
    return this.id;
  }

  public getCurrentPassword(): string {
    return this.currentPassword;
  }

  public getNewPassword(): string {
    return this.newPassword;
  }

  public getPasswordConfirmation(): string {
    return this.passwordConfirmation;
  }
}

class PasswordUpdateBuilder {
  private id!: string;
  private currentPassword!: string;
  private newPassword!: string;
  private passwordConfirmation!: string;

  public setId(id: string): PasswordUpdateBuilder {
    this.id = id;
    return this;
  }

  public setCurrentPassword(currentPassword: string): PasswordUpdateBuilder {
    this.currentPassword = currentPassword;
    return this;
  }

  public setNewPassword(newPassword: string): PasswordUpdateBuilder {
    this.newPassword = newPassword;
    return this;
  }

  public setPasswordConfirmation(passwordConfirmation: string): PasswordUpdateBuilder {
    this.passwordConfirmation = passwordConfirmation;
    return this;
  }

  public getId(): string {
    return this.id;
  }

  public getCurrentPassword(): string {
    return this.currentPassword;
  }

  public getNewPassword(): string {
    return this.newPassword;
  }

  public getPasswordConfirmation(): string {
    return this.passwordConfirmation;
  }

  public build(): PasswordUpdate {
    return PasswordUpdate.build(this);
  }
}
