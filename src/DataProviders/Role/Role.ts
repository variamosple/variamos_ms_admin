import { Model, type NonAttribute, NUMBER, TEXT } from "sequelize";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import type { PermissionModel } from "../Permission/Permission.js";
import type { UserModel } from "../User/User.js";

export interface RoleAttributes {
  id?: number;
  name: string;
}

export class RoleModel extends Model<RoleAttributes> implements RoleAttributes {
  public id?: number;
  public name!: string;
  // Associations, set when a query includes them
  declare public permissions?: NonAttribute<PermissionModel[]>;
  declare public users?: NonAttribute<UserModel[]>;
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
    schema: DB_SCHEMA,
    timestamps: false,
  },
);
