import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import { ARRAY, BOOLEAN, INTEGER, JSONB, Model, STRING, TEXT } from "sequelize";

export type ConfigurationValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>;

export interface ConfigurationAttributes {
  id?: number;
  key: string;
  value: ConfigurationValue;
  type: "boolean" | "string" | "number" | "array" | "object";
  category: "general" | "security" | "notification" | "env";
  requiresMfa: boolean;
  isSecret: boolean;
  environmentScope: string;
  isReadOnly: boolean;
  targetServices: string[];
  description?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ConfigurationModel
  extends Model<ConfigurationAttributes>
  implements ConfigurationAttributes
{
  public id!: number;
  public key!: string;
  public value!: ConfigurationValue;
  public type!: "boolean" | "string" | "number" | "array" | "object";
  public category!: "general" | "security" | "notification" | "env";
  public requiresMfa!: boolean;
  public isSecret!: boolean;
  public environmentScope!: string;
  public isReadOnly!: boolean;
  public targetServices!: string[];
  public description?: string;
  public updatedBy?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ConfigurationModel.init(
  {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: STRING(100),
      unique: true,
      allowNull: false,
    },
    value: {
      type: JSONB,
      allowNull: false,
    },
    type: {
      type: STRING(30),
      allowNull: false,
    },
    category: {
      type: STRING(50),
      allowNull: false,
    },
    requiresMfa: {
      type: BOOLEAN,
      defaultValue: false,
      field: "requires_mfa",
    },
    isSecret: {
      type: BOOLEAN,
      defaultValue: false,
      field: "is_secret",
    },
    environmentScope: {
      type: STRING(20),
      defaultValue: "all",
      field: "environment_scope",
    },
    isReadOnly: {
      type: BOOLEAN,
      defaultValue: false,
      field: "is_read_only",
    },
    targetServices: {
      type: ARRAY(STRING(50)),
      allowNull: false,
      field: "target_services",
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
    tableName: "configurations",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    underscored: true,
  },
);
