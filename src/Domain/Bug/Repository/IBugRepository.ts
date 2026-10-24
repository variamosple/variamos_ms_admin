import type { BugComponentValue } from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Bug, BugUserRef } from "../Entity/Bug.js";
import type { BugAttachment } from "../Entity/BugAttachment.js";
import type { BugFilter } from "../Entity/BugFilter.js";
import type { BugNote } from "../Entity/BugNote.js";
import type { BugStatusLog } from "../Entity/BugStatusLog.js";

export interface IBugRepository {
  queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>>;
  queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>>;
  findById(request: RequestModel<string>): Promise<ResponseModel<Bug | null>>;
  saveOrUpdateBug(
    request: RequestModel<Bug>,
  ): Promise<ResponseModel<{ created: boolean; updated: boolean }>>;
  rejectBug(
    request: RequestModel<{
      id: string;
      adminId: string;
      logComment: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
  restoreBug(
    request: RequestModel<{
      id: string;
      adminId: string;
      logComment: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
  findExpiredRejectedBugs(
    request: RequestModel<Date>,
  ): Promise<ResponseModel<Bug[]>>;
  updateAttachmentPath(
    request: RequestModel<{ id: number; filePath: string }>,
  ): Promise<ResponseModel<void>>;
  createLog(
    request: RequestModel<{
      action: string;
      comment: string;
      bugId: string;
      operatorId?: string;
    }>,
  ): Promise<ResponseModel<void>>;
  createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: BugPriorityValue;
      category: string;
      component?: BugComponentValue;
      githubRepo?: string;
      createdById: string;
      resolvedFile?: { filePath: string; fileType: string };
      reporterEmail: string;
      status: string;
      logComment: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
  queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>>;
  updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
      gitIssueNumber?: number;
      githubHtmlUrl?: string;
      title?: string;
      description?: string;
      priority?: BugPriorityValue;
      category?: string;
      component?: BugComponentValue;
      githubRepo?: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
  createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<BugAttachment>>;
  deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>>;
  findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugAttachment | null>>;
  createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>>;
  queryNotes(request: RequestModel<string>): Promise<ResponseModel<BugNote[]>>;
  /** Replaces the administrators assigned to a bug; answers the new list. */
  setAssignees(
    request: RequestModel<{
      bugId: string;
      userIds: string[];
      assignedBy?: string;
    }>,
  ): Promise<ResponseModel<BugUserRef[]>>;
  /** Enabled accounts that hold the given permission. */
  queryUsersWithPermission(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugUserRef[]>>;
}
