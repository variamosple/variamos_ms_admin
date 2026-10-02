import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM.js";
import { BIGINT, DATEONLY, DECIMAL, INTEGER, Model, STRING } from "sequelize";

export interface MicroServiceDailyStatsAttributes {
  id?: number;
  serviceName: string;
  statDate: string; // YYYY-MM-DD
  uptimePercentage: number;
  avgLatencyMs: number;
  totalChecks: number;
  successfulChecks: number;
  degradedChecks: number;
  failedChecks: number;
  createdAt?: Date;
}

export class MicroServiceDailyStatsModel
  extends Model<MicroServiceDailyStatsAttributes>
  implements MicroServiceDailyStatsAttributes
{
  public id!: number;
  public serviceName!: string;
  public statDate!: string;
  public uptimePercentage!: number;
  public avgLatencyMs!: number;
  public totalChecks!: number;
  public successfulChecks!: number;
  public degradedChecks!: number;
  public failedChecks!: number;
  public readonly createdAt!: Date;
}

MicroServiceDailyStatsModel.init(
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
    statDate: {
      type: DATEONLY,
      allowNull: false,
      field: "stat_date",
    },
    uptimePercentage: {
      type: DECIMAL(5, 2),
      allowNull: false,
      field: "uptime_percentage",
    },
    avgLatencyMs: {
      type: INTEGER,
      allowNull: false,
      field: "avg_latency_ms",
    },
    totalChecks: {
      type: INTEGER,
      allowNull: false,
      field: "total_checks",
    },
    successfulChecks: {
      type: INTEGER,
      allowNull: false,
      field: "successful_checks",
    },
    degradedChecks: {
      type: INTEGER,
      allowNull: false,
      field: "degraded_checks",
    },
    failedChecks: {
      type: INTEGER,
      allowNull: false,
      field: "failed_checks",
    },
    createdAt: {
      type: "TIMESTAMP",
      field: "created_at",
      defaultValue: "CURRENT_TIMESTAMP",
    },
  },
  {
    sequelize: VARIAMOS_ORM,
    tableName: "microservice_daily_stats",
    schema: DB_SCHEMA,
    timestamps: false,
  },
);
