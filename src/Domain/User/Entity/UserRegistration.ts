import { Credentials } from "./Credentials";

export class UserRegistration extends Credentials {
  name: string;
  passwordConfirmation: string;

  constructor(
    name: string,
    email: string,
    password: string,
    passwordConfirmation: string
  ) {
    super(email, password);

    this.name = name;
    this.passwordConfirmation = passwordConfirmation;
  }
}
