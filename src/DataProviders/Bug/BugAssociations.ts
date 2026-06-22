import { BugModel } from "./Bug";
import { BugAttachmentModel } from "./BugAttachment";
import { BugLogModel } from "./BugLog";
import { UserModel } from "../User/User";

// Bug Associations
BugModel.hasMany(BugAttachmentModel, {
  foreignKey: "bug_id",
  as: "attachments",
  onDelete: "CASCADE",
});

BugAttachmentModel.belongsTo(BugModel, {
  foreignKey: "bug_id",
  as: "bug",
});

BugModel.hasMany(BugLogModel, {
  foreignKey: "bug_id",
  as: "logs",
  onDelete: "CASCADE",
});

BugLogModel.belongsTo(BugModel, {
  foreignKey: "bug_id",
  as: "bug",
});

BugModel.belongsTo(UserModel, {
  foreignKey: "created_by_id",
  as: "createdBy",
});

BugLogModel.belongsTo(UserModel, {
  foreignKey: "operator_id",
  as: "changedBy",
});
