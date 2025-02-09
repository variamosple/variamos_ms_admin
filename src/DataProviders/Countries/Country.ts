import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { Model, NUMBER, TEXT } from "sequelize";

interface CountryAttributes {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

export class CountryModel
  extends Model<CountryAttributes>
  implements CountryAttributes
{
  public code!: string;
  public name!: string;
  public latitude!: number;
  public longitude!: number;
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
  },
  {
    tableName: "country",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: false,
  }
);
