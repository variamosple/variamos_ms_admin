import { UserModel } from "../User/User";
import { LocalBugModel } from "./LocalBug";
import { LocalBugAttachmentModel } from "./LocalBugAttachment";
import { LocalBugLogModel } from "./LocalBugLog";

// LocalBug - User (Creator)
LocalBugModel.belongsTo(UserModel, {
  foreignKey: "created_by_id",
  as: "createdBy",
});

// LocalBug - Attachments
LocalBugAttachmentModel.belongsTo(LocalBugModel, {
  foreignKey: "local_bug_id",
  as: "localBug",
});
LocalBugModel.hasMany(LocalBugAttachmentModel, {
  foreignKey: "local_bug_id",
  as: "attachments",
});

// LocalBug - Status/Action Logs
LocalBugLogModel.belongsTo(LocalBugModel, {
  foreignKey: "local_bug_id",
  as: "localBug",
});
LocalBugModel.hasMany(LocalBugLogModel, {
  foreignKey: "local_bug_id",
  as: "statusLogs",
});

// Log - User (Operator/Admin)
LocalBugLogModel.belongsTo(UserModel, {
  as: "changedBy",
  foreignKey: "operator_id",
});
