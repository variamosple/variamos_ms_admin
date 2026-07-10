import { Nullable } from "@src/Domain/Core/Entity/Nullable";

export class Permission {
  public id: Nullable<number>;
  public name: string;

  public constructor(id: Nullable<number>, name: string) {
    this.id = id;
    this.name = name;
  }
}
