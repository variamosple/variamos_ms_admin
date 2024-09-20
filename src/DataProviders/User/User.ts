import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, TEXT, UUID, UUIDV4 } from "sequelize";

interface UserAttributes {}

interface UserAttributes {
  id?: string;
  user: string;
  name: string;
  email: string;
  password?: string;
}

export class UserModel extends Model<UserAttributes> implements UserAttributes {
  public id?: string;
  public user!: string;
  public name!: string;
  public email!: string;
  public password?: string;
}

UserModel.init(
  {
    id: {
      type: UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
      allowNull: false,
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
    password: {
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
