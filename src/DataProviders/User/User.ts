import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, TEXT } from "sequelize";

interface UserAttributes {}

interface UserAttributes {
  id: string;
  user: string;
  name: string;
  email: string;
}

export class UserModel extends Model<UserAttributes> implements UserAttributes {
  public id!: string;
  public user!: string;
  public name!: string;
  public email!: string;
}

UserModel.init(
  {
    id: {
      type: TEXT,
      primaryKey: true,
    },
    user: {
      type: TEXT,
    },
    name: {
      type: TEXT,
    },
    email: {
      type: TEXT,
    },
  },
  {
    tableName: "user",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);
