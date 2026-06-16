import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "../Entity/Bug";
import { BugFilter } from "../Entity/BugFilter";
import { BugStatusLog } from "../Entity/BugStatusLog";

export interface ILocalBugRepository {
  queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>>;
  findById(request: RequestModel<string>): Promise<ResponseModel<Bug | null>>;
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
      localBugId: string;
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
    }>,
  ): Promise<ResponseModel<Bug>>;
}
