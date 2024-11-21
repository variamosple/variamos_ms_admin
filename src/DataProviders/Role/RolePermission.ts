import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER } from "sequelize";
import { PermissionModel } from "../Permission/Permission";
import { RoleModel } from "./Role";

interface RolePermissionAttributes {
  roleId: number;
  permissionId: number;
}

export class RolePermissionModel
  extends Model<RolePermissionAttributes>
  implements RolePermissionAttributes
{
  public roleId!: number;
  public permissionId!: number;
}

RolePermissionModel.init(
  {
    roleId: {
      type: NUMBER,
      field: "role_id",
      allowNull: false,
      primaryKey: true,
    },
    permissionId: {
      type: NUMBER,
      field: "permission_id",
      allowNull: false,
      primaryKey: true,
    },
  },
  {
    tableName: "role_permission",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);

RoleModel.belongsToMany(PermissionModel, {
  through: RolePermissionModel,
  foreignKey: "role_id",
  as: "permissions",
});

PermissionModel.belongsToMany(RoleModel, {
  through: RolePermissionModel,
  foreignKey: "permission_id",
  as: "roles",
});
