import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";

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
      allowNull: false,
      primaryKey: true,
    },
    roleId: {
      type: NUMBER,
      field: "role_id",
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
