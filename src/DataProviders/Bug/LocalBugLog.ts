import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { DATE, INTEGER, Model, TEXT, UUID } from "sequelize";

export interface LocalBugLogAttributes {
  id?: number;
  action: string;
  comment?: string;
  localBugId: string;
  operatorId?: string;
  createdAt?: Date;
}

export class LocalBugLogModel
  extends Model<LocalBugLogAttributes>
  implements LocalBugLogAttributes
{
  public id?: number;
  public action!: string;
  public comment?: string;
  public localBugId!: string;
  public operatorId?: string;
  public createdAt?: Date;
}

LocalBugLogModel.init(
  {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
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
    localBugId: {
      type: UUID,
      field: "local_bug_id",
      allowNull: false,
    },
    operatorId: {
      type: UUID,
      field: "operator_id",
      allowNull: true,
    },
    createdAt: {
      type: DATE,
      allowNull: false,
      field: "created_at",
    },
  },
  {
    tableName: "local_bug_logs",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
