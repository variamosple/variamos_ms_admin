import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";

interface CountryAttributes {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  code3: string;
}

export class CountryModel extends Model<CountryAttributes> implements CountryAttributes {
  public code!: string;
  public name!: string;
  public latitude!: number;
  public longitude!: number;
  public code3!: string;
}

CountryModel.init(
  {
    code: {
      type: TEXT,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: TEXT,
      allowNull: false,
    },
    latitude: {
      type: NUMBER,
      allowNull: false,
    },
    longitude: {
      type: NUMBER,
      allowNull: false,
    },
    code3: {
      type: TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "country",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: false,
  },
);
