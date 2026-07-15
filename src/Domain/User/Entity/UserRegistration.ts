import { Credentials } from "./Credentials";
import { Email } from "./Email";
import { Password } from "./Password";

export class UserRegistration extends Credentials {
  public name: string;
  public passwordConfirmation: string;

  public constructor(
    name: string,
    email: string | Email,
    password: string | Password,
    passwordConfirmation: string,
  ) {
    const validatedEmail = email instanceof Email ? email : new Email(email);
    const validatedPassword = password instanceof Password ? password : new Password(password);

    super(validatedEmail.getValue(), validatedPassword.getValue());

    if (!name || name.trim() === "") {
      throw new Error("Full name, Email and password, and password confirmation are required.");
    }
    if (validatedPassword.getValue() !== passwordConfirmation) {
      throw new Error("Password and password confirmation do not match.");
    }

    this.name = name;
    this.passwordConfirmation = passwordConfirmation;
  }

  public static builder(): UserRegistrationBuilder {
    return new UserRegistrationBuilder();
  }
}

export class UserRegistrationBuilder {
  private name!: string;
  private email!: string;
  private password!: string;
  private passwordConfirmation!: string;

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public setEmail(email: string): this {
    this.email = email;
    return this;
  }

  public setPassword(password: string): this {
    this.password = password;
    return this;
  }

  public setPasswordConfirmation(passwordConfirmation: string): this {
    this.passwordConfirmation = passwordConfirmation;
    return this;
  }

  public build(): UserRegistration {
    if (!this.name || !this.email || !this.password || !this.passwordConfirmation) {
      throw new Error("Full name, Email and password, and password confirmation are required.");
    }
    const validatedEmail = new Email(this.email);
    const validatedPassword = new Password(this.password);
    return new UserRegistration(
      this.name,
      validatedEmail,
      validatedPassword,
      this.passwordConfirmation,
    );
  }
}
