import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import { DATE, INTEGER, Model, TEXT, UUID } from "sequelize";
import { UserModel } from "../User/User";

export interface BugNoteAttributes {
  id?: number;
  body: string;
  bugId: string;
  authorId?: string;
  createdAt?: Date;
}

export class BugNoteModel extends Model<BugNoteAttributes> implements BugNoteAttributes {
  public id?: number;
  public body!: string;
  public bugId!: string;
  public authorId?: string;
  public createdAt?: Date;
}

BugNoteModel.init(
  {
    id: {
      type: INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    body: {
      type: TEXT,
      allowNull: false,
    },
    bugId: {
      type: UUID,
      field: "bug_id",
      allowNull: false,
    },
    authorId: {
      type: UUID,
      field: "author_id",
      allowNull: true,
      references: { model: UserModel, key: "id" },
    },
    createdAt: {
      type: DATE,
      allowNull: false,
      field: "created_at",
    },
  },
  {
    tableName: "bug_notes",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
