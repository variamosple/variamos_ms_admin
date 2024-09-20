import { Credentials } from "./Credentials";

export class UserRegistration extends Credentials {
  name: string;

  constructor(name: string, email: string, password: string) {
    super(email, password);

    this.name = name;
  }
}
