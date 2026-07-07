import { Credentials } from "./Credentials";

export class UserRegistration extends Credentials {
  public name: string;
  public passwordConfirmation: string;

  public constructor(name: string, email: string, password: string, passwordConfirmation: string) {
    super(email, password);

    this.name = name;
    this.passwordConfirmation = passwordConfirmation;
  }
}
