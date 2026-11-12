import type { BugComponentValue } from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Bug } from "../Entity/Bug.js";

/** A new status, with the fields an approval may have corrected. */
export interface BugStatusUpdate {
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
}

/** Writes bugs: creation, synchronization, status changes and their log. */
export interface IBugRepository {
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
  updateStatus(
    request: RequestModel<BugStatusUpdate>,
  ): Promise<ResponseModel<Bug>>;
}
