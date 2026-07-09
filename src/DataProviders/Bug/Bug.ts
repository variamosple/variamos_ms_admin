import VARIAMOS_ORM, { DB_SCHEMA } from "@src/Infrastructure/VariamosORM";
import { DATE, ENUM, INTEGER, Model, TEXT, UUID, UUIDV4 } from "sequelize";

export interface BugAttributes {
  id?: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  category?: string;
  status: string;
  reporterEmail?: string;
  createdById?: string;
  githubRepo?: string;
  gitIssueNumber?: number;
  githubCreator?: string;
  githubHtmlUrl?: string;
  githubAssignee?: string;
  githubCreatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BugModel extends Model<BugAttributes> implements BugAttributes {
  public id?: string;
  public title!: string;
  public description!: string;
  public priority!: "low" | "medium" | "high";
  public category?: string;
  public status!: string;
  public reporterEmail?: string;
  public createdById?: string;
  public githubRepo?: string;
  public gitIssueNumber?: number;
  public githubCreator?: string;
  public githubHtmlUrl?: string;
  public githubAssignee?: string;
  public githubCreatedAt?: Date;
  public createdAt?: Date;
  public updatedAt?: Date;
}

BugModel.init(
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
    priority: {
      type: ENUM("low", "medium", "high"),
      defaultValue: "medium",
      allowNull: false,
    },
    category: {
      type: TEXT,
      allowNull: true,
    },
    status: {
      type: TEXT,
      defaultValue: "pending",
      allowNull: false,
    },
    reporterEmail: {
      type: TEXT,
      field: "reporter_email",
      allowNull: true,
    },
    createdById: {
      type: TEXT,
      field: "created_by_id",
      allowNull: true,
    },
    githubRepo: {
      type: TEXT,
      field: "github_repo",
      allowNull: true,
    },
    gitIssueNumber: {
      type: INTEGER,
      field: "git_issue_number",
      allowNull: true,
    },
    githubCreator: {
      type: TEXT,
      field: "github_creator",
      allowNull: true,
    },
    githubHtmlUrl: {
      type: TEXT,
      field: "github_html_url",
      allowNull: true,
    },
    githubAssignee: {
      type: TEXT,
      field: "github_assignee",
      allowNull: true,
    },
    githubCreatedAt: {
      type: DATE,
      field: "github_created_at",
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
    tableName: "bugs",
    sequelize: VARIAMOS_ORM,
    schema: DB_SCHEMA,
    timestamps: true,
    underscored: true,
  },
);
