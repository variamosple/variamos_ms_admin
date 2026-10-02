import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import { BIGINT, INTEGER, Model, STRING, TEXT } from "sequelize";

export interface MicroServiceHealthLogAttributes {
  id?: number;
  serviceName: string;
  status: "UP" | "DEGRADED" | "DOWN";
  responseTimeMs: number;
  httpStatusCode?: number;
  errorMessage?: string;
  checkedAt?: Date;
}

export class MicroServiceHealthLogModel
  extends Model<MicroServiceHealthLogAttributes>
  implements MicroServiceHealthLogAttributes
{
  public id!: number;
  public serviceName!: string;
  public status!: "UP" | "DEGRADED" | "DOWN";
  public responseTimeMs!: number;
  public httpStatusCode?: number;
  public errorMessage?: string;
  public readonly checkedAt!: Date;
}

MicroServiceHealthLogModel.init(
  {
    id: {
      type: BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    serviceName: {
      type: STRING(100),
      allowNull: false,
      field: "service_name",
    },
    status: {
      type: STRING(20),
      allowNull: false,
    },
    responseTimeMs: {
      type: INTEGER,
      allowNull: false,
      field: "response_time_ms",
    },
    httpStatusCode: {
      type: INTEGER,
      allowNull: true,
      field: "http_status_code",
    },
    errorMessage: {
      type: TEXT,
      allowNull: true,
      field: "error_message",
    },
    checkedAt: {
      type: "TIMESTAMP",
      allowNull: true,
      field: "checked_at",
    },
  },
  {
    tableName: "microservice_health_logs",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    createdAt: "checked_at",
    updatedAt: false,
    underscored: true,
  },
);
