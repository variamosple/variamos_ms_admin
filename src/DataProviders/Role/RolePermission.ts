import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER } from "sequelize";

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
