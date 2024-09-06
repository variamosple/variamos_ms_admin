import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Role {
  id: Nullable<number>;
  name: string;

  constructor(id: Nullable<number>, name: string) {
    this.id = id;
    this.name = name;
  }
}
