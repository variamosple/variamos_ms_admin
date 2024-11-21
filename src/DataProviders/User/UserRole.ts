import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";
import { RoleModel } from "../Role/Role";
import { UserModel } from "./User";

interface UserRoleAttributes {
  userId: string;
  roleId: number;
}

export class UserRoleModel
  extends Model<UserRoleAttributes>
  implements UserRoleAttributes
{
  public userId!: string;
  public roleId!: number;
}

UserRoleModel.init(
  {
    userId: {
      type: TEXT,
      field: "user_id",
      references: { model: UserModel, key: "id" },
      allowNull: false,
      primaryKey: true,
    },
    roleId: {
      type: NUMBER,
      field: "role_id",
      references: { model: RoleModel, key: "id" },
      allowNull: false,
      primaryKey: true,
    },
  },
  {
    tableName: "user_role",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);

UserModel.belongsToMany(RoleModel, {
  through: UserRoleModel,
  foreignKey: "userId",
  otherKey: "roleId",
  as: "roles",
});
RoleModel.belongsToMany(UserModel, {
  through: UserRoleModel,
  foreignKey: "roleId",
  otherKey: "userId",
  as: "users",
});
