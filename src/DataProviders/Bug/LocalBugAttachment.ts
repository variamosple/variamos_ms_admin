import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { DATE, INTEGER, Model, TEXT, UUID } from "sequelize";

export interface LocalBugAttachmentAttributes {
  id?: number;
  filePath: string;
  fileType: string;
  localBugId: string;
  createdAt?: Date;
}

export class LocalBugAttachmentModel
  extends Model<LocalBugAttachmentAttributes>
  implements LocalBugAttachmentAttributes
{
  public id?: number;
  public filePath!: string;
  public fileType!: string;
  public localBugId!: string;
  public createdAt?: Date;
}

LocalBugAttachmentModel.init(
  {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    filePath: {
      type: TEXT,
      field: "file_path",
      allowNull: false,
    },
    fileType: {
      type: TEXT,
      field: "file_type",
      allowNull: false,
    },
    localBugId: {
      type: UUID,
      field: "local_bug_id",
      allowNull: false,
    },
    createdAt: {
      type: DATE,
      allowNull: false,
      field: "created_at",
    },
  },
  {
    tableName: "local_bug_attachments",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: true,
    updatedAt: false, // No updatedAt for attachments
    underscored: true,
  },
);
