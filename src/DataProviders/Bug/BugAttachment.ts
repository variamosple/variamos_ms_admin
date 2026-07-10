import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import { DATE, INTEGER, Model, TEXT, UUID } from "sequelize";

export interface BugAttachmentAttributes {
  id?: number;
  filePath: string;
  fileType: string;
  bugId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BugAttachmentModel
  extends Model<BugAttachmentAttributes>
  implements BugAttachmentAttributes
{
  public id?: number;
  public filePath!: string;
  public fileType!: string;
  public bugId!: string;
  public createdAt?: Date;
  public updatedAt?: Date;
}

BugAttachmentModel.init(
  {
    id: {
      type: INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    bugId: {
      type: UUID,
      field: "bug_id",
      allowNull: false,
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
    tableName: "bug_attachments",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    underscored: true,
  },
);
