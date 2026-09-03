import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import { BOOLEAN, INTEGER, Model, STRING, TEXT } from "sequelize";

export interface MicroServiceConfigurationAttributes {
  id?: number;
  serviceName: string;
  configKey: string;
  configValue: string;
  valueType: "string" | "number" | "boolean" | "json";
  isSecret: boolean;
  isReadOnly: boolean;
  description?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MicroServiceConfigurationModel
  extends Model<MicroServiceConfigurationAttributes>
  implements MicroServiceConfigurationAttributes
{
  public id!: number;
  public serviceName!: string;
  public configKey!: string;
  public configValue!: string;
  public valueType!: "string" | "number" | "boolean" | "json";
  public isSecret!: boolean;
  public isReadOnly!: boolean;
  public description?: string;
  public updatedBy?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MicroServiceConfigurationModel.init(
  {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    serviceName: {
      type: STRING(100),
      allowNull: false,
      field: "service_name",
    },
    configKey: {
      type: STRING(150),
      allowNull: false,
      field: "config_key",
    },
    configValue: {
      type: TEXT,
      allowNull: false,
      field: "config_value",
    },
    valueType: {
      type: STRING(20),
      defaultValue: "string",
      field: "value_type",
    },
    isSecret: {
      type: BOOLEAN,
      defaultValue: false,
      field: "is_secret",
    },
    isReadOnly: {
      type: BOOLEAN,
      defaultValue: false,
      field: "is_read_only",
    },
    description: {
      type: TEXT,
      allowNull: true,
    },
    updatedBy: {
      type: STRING(100),
      allowNull: true,
      field: "updated_by",
    },
  },
  {
    tableName: "microservice_configurations",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    underscored: true,
  },
);
