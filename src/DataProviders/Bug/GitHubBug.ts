import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { DATE, ENUM, INTEGER, Model, TEXT } from "sequelize";

export interface GitHubBugAttributes {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: string;
  githubRepo: string;
  gitIssueNumber: number;
  githubCreator: string;
  githubHtmlUrl: string;
  githubAssignee?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GitHubBugModel
  extends Model<GitHubBugAttributes>
  implements GitHubBugAttributes
{
  public id!: string;
  public title!: string;
  public description!: string;
  public priority!: "low" | "medium" | "high";
  public status!: string;
  public githubRepo!: string;
  public gitIssueNumber!: number;
  public githubCreator!: string;
  public githubHtmlUrl!: string;
  public githubAssignee?: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

GitHubBugModel.init(
  {
    id: {
      type: TEXT,
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
    status: {
      type: TEXT,
      defaultValue: "open",
      allowNull: false,
    },
    githubRepo: {
      type: TEXT,
      field: "github_repo",
      allowNull: false,
    },
    gitIssueNumber: {
      type: INTEGER,
      field: "git_issue_number",
      allowNull: false,
    },
    githubCreator: {
      type: TEXT,
      field: "github_creator",
      allowNull: false,
    },
    githubHtmlUrl: {
      type: TEXT,
      field: "github_html_url",
      allowNull: false,
    },
    githubAssignee: {
      type: TEXT,
      field: "github_assignee",
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
    tableName: "github_bugs",
    sequelize: VARIAMOS_ORM,
    schema: "variamos",
    timestamps: true,
    underscored: true,
  },
);
