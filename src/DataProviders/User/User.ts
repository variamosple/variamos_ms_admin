import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { BOOLEAN, DATE, Model, TEXT, UUID, UUIDV4 } from "sequelize";
import { CountryModel } from "../Countries/Country";

export interface UserAttributes {
  id?: string;
  user: string;
  name: string;
  email: string;
  countryCode?: string;
  password?: string;
  isEnabled?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  lastLogin?: Date;
}

export class UserModel extends Model<UserAttributes> implements UserAttributes {
  public id?: string;
  public user!: string;
  public name!: string;
  public email!: string;
  public countryCode?: string;
  public password?: string;
  public isEnabled?: boolean;
  public isDeleted?: boolean;
  public createdAt?: Date;
  public lastLogin?: Date;
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
    countryCode: {
      type: TEXT,
      field: "country_code",
      references: { model: CountryModel, key: "code" },
    },
    password: {
      type: TEXT,
    },
    isEnabled: {
      type: BOOLEAN,
      allowNull: false,
      field: "is_enabled",
    },
    isDeleted: {
      type: BOOLEAN,
      allowNull: false,
      field: "is_deleted",
    },
    createdAt: {
      type: DATE,
      allowNull: false,
      field: "created_at",
    },
    lastLogin: {
      type: DATE,
      field: "last_login",
    },
  },
  {
    tableName: "user",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);

UserModel.hasOne(CountryModel, {
  foreignKey: "code",
  sourceKey: "countryCode",
  as: "country",
});
