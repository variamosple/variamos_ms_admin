import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Permission {
  id: Nullable<number>;
  name: string;

  constructor(id: Nullable<number>, name: string) {
    this.id = id;
    this.name = name;
  }
}
