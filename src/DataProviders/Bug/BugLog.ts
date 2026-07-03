import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { DATE, INTEGER, Model, TEXT, UUID } from "sequelize";

export interface BugLogAttributes {
  id?: number;
  action: string;
  comment?: string;
  bugId: string;
  operatorId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BugLogModel
  extends Model<BugLogAttributes>
  implements BugLogAttributes
{
  public id?: number;
  public action!: string;
  public comment?: string;
  public bugId!: string;
  public operatorId?: string;
  public createdAt?: Date;
  public updatedAt?: Date;
}

BugLogModel.init(
  {
    id: {
      type: INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    action: {
      type: TEXT,
      allowNull: false,
    },
    comment: {
      type: TEXT,
      allowNull: true,
    },
    bugId: {
      type: UUID,
      field: "bug_id",
      allowNull: false,
    },
    operatorId: {
      type: TEXT,
      field: "operator_id",
      allowNull: true,
    },
    createdAt: {
      type: DATE,
      allowNull: false,
      field: "created_at",
    },
    updatedAt: {
      type: DATE,
      allowNull: false,
      field: "updated_at",
    },
  },
  {
    tableName: "bug_status_logs",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: true,
    underscored: true,
  },
);
