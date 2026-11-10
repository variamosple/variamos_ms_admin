import { BIGINT, JSONB, Model, STRING } from "sequelize";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";

export interface MicroServiceAuditLogAttributes {
  id?: number;
  serviceName: string;
  actionType: string;
  details: Record<string, unknown>;
  performedBy: string;
  createdAt?: Date;
}

export class MicroServiceAuditLogModel
  extends Model<MicroServiceAuditLogAttributes>
  implements MicroServiceAuditLogAttributes
{
  public id!: number;
  public serviceName!: string;
  public actionType!: string;
  public details!: Record<string, unknown>;
  public performedBy!: string;
  public readonly createdAt!: Date;
}

MicroServiceAuditLogModel.init(
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
    actionType: {
      type: STRING(50),
      allowNull: false,
      field: "action_type",
    },
    details: {
      type: JSONB,
      allowNull: false,
    },
    performedBy: {
      type: STRING(100),
      allowNull: false,
      field: "performed_by",
    },
  },
  {
    tableName: "microservice_audit_logs",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    // underscored maps the createdAt attribute to the created_at column.
    // Naming the attribute "created_at" left createdAt undefined, so every
    // entry of the audit trail showed N/A for its date.
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
