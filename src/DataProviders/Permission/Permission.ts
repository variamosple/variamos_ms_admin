import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";

interface PermissionAttributes {}

interface PermissionAttributes {
  id?: number;
  name: string;
}

export class PermissionModel
  extends Model<PermissionAttributes>
  implements PermissionAttributes
{
  public id?: number;
  public name!: string;
}

PermissionModel.init(
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
    tableName: "permission",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);
