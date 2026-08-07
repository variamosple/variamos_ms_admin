import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugAttachmentModel } from "./BugAttachment.js";
import { BugLogModel } from "./BugLog.js";

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

import { BugNoteModel } from "./BugNote.js";

BugModel.hasMany(BugNoteModel, {
  foreignKey: "bug_id",
  as: "notes",
  onDelete: "CASCADE",
});

BugNoteModel.belongsTo(BugModel, {
  foreignKey: "bug_id",
  as: "bug",
});

BugNoteModel.belongsTo(UserModel, {
  foreignKey: "author_id",
  as: "author",
});
