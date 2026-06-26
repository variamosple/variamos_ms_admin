import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "../Entity/Bug";
import { BugFilter } from "../Entity/BugFilter";
import { BugStatusLog } from "../Entity/BugStatusLog";

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
      priority: "low" | "medium" | "high";
      category: string;
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
      priority?: "low" | "medium" | "high";
      category?: string;
      githubRepo?: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
  createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<any>>;
  deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>>;
  findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<any | null>>;
}
