import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { DATE, ENUM, Model, TEXT, UUID, UUIDV4 } from "sequelize";

export interface LocalBugAttributes {
  id?: string;
  title: string;
  description: string;
  reporterEmail: string;
  priority: "low" | "medium" | "high";
  category: string;
  status: string;
  githubRepo?: string;
  createdById?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class LocalBugModel
  extends Model<LocalBugAttributes>
  implements LocalBugAttributes
{
  public id?: string;
  public title!: string;
  public description!: string;
  public reporterEmail!: string;
  public priority!: "low" | "medium" | "high";
  public category!: string;
  public status!: string;
  public githubRepo?: string;
  public createdById?: string;
  public createdAt?: Date;
  public updatedAt?: Date;
}

LocalBugModel.init(
  {
    id: {
      type: UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    title: {
      type: TEXT,
      allowNull: false,
    },
    description: {
      type: TEXT,
      allowNull: false,
    },
    reporterEmail: {
      type: TEXT,
      field: "reporter_email",
      allowNull: false,
    },
    priority: {
      type: ENUM("low", "medium", "high"),
      defaultValue: "medium",
      allowNull: false,
    },
    category: {
      type: TEXT,
      allowNull: false,
    },
    status: {
      type: TEXT,
      defaultValue: "pending",
      allowNull: false,
    },
    githubRepo: {
      type: TEXT,
      field: "github_repo",
      allowNull: true,
    },
    createdById: {
      type: UUID,
      field: "created_by_id",
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
    tableName: "local_bugs",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: true,
    underscored: true,
  },
);
