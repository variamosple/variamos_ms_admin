import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";

export interface RoleAttributes {
  id?: number;
  name: string;
}

export class RoleModel extends Model<RoleAttributes> implements RoleAttributes {
  public id?: number;
  public name!: string;
}

RoleModel.init(
  {
    id: {
      type: NUMBER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: TEXT,
    },
  },
  {
    tableName: "role",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);
