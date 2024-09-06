import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class User {
  id: Nullable<string>;
  user: string;
  name: string;
  email: string;

  constructor(id: Nullable<string>, user: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.user = user;
    this.email = email;
  }
}
