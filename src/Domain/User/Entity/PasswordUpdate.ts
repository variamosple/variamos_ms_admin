export class PasswordUpdate {
  private readonly id: string;
  private readonly currentPassword: string;
  private readonly newPassword: string;
  private readonly passwordConfirmation: string;

  constructor(
    id: string,
    currentPassword: string,
    newPassword: string,
    passwordConfirmation: string
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
      builder.getPasswordConfirmation()
    );
  }

  getId(): string {
    return this.id;
  }

  getCurrentPassword(): string {
    return this.currentPassword;
  }

  getNewPassword(): string {
    return this.newPassword;
  }

  getPasswordConfirmation(): string {
    return this.passwordConfirmation;
  }
}

class PasswordUpdateBuilder {
  private id!: string;
  private currentPassword!: string;
  private newPassword!: string;
  private passwordConfirmation!: string;

  setId(id: string): PasswordUpdateBuilder {
    this.id = id;
    return this;
  }

  setCurrentPassword(currentPassword: string): PasswordUpdateBuilder {
    this.currentPassword = currentPassword;
    return this;
  }

  setNewPassword(newPassword: string): PasswordUpdateBuilder {
    this.newPassword = newPassword;
    return this;
  }

  setPasswordConfirmation(passwordConfirmation: string): PasswordUpdateBuilder {
    this.passwordConfirmation = passwordConfirmation;
    return this;
  }

  getId(): string {
    return this.id;
  }

  getCurrentPassword(): string {
    return this.currentPassword;
  }

  getNewPassword(): string {
    return this.newPassword;
  }

  getPasswordConfirmation(): string {
    return this.passwordConfirmation;
  }

  public build(): PasswordUpdate {
    return PasswordUpdate.build(this);
  }
}
